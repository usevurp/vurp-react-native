import { useState } from "react";
import { FlatList, Image, Linking, Pressable, StyleSheet, View } from "react-native";
import type { Attachment, Conversation, Message } from "../core/types";
import { useVurp, useVurpState, useVurpTheme, useVurpUi } from "../react/hooks";
import { canSend, Composer } from "./Composer";
import { Button, VText, when } from "./parts";
import type { VurpTheme } from "./theme";

const EMPTY: Message[] = [];

/** One conversation: its messages, newest at the bottom, and the composer. */
export function ConversationView({ conversation }: { conversation: Conversation | null }) {
  const client = useVurp();
  const theme = useVurpTheme();
  const { strings } = useVurpUi();
  const starting = useVurpState((s) => s.starting);
  const list = useVurpState((s) => (conversation ? (s.messages[conversation.id] ?? EMPTY) : EMPTY));
  const files = useVurpState((s) => s.files);
  const config = useVurpState((s) => s.config);
  const email = useVurpState((s) => s.profile.email);
  const [draft, setDraft] = useState("");

  const messages = conversation ? list : starting ? [starting] : EMPTY;
  const closed = conversation?.status === "closed";
  const last = messages[messages.length - 1];
  const clydeWriting =
    conversation?.assistantActive && last?.senderType === "visitor" && last.state === "sent";

  const send = () => {
    if (!conversation || !canSend({ files }, draft)) return;
    void client.send(draft.trim());
    setDraft("");
  };

  const notice = conversation?.assistantActive
    ? strings.assistantNotice
    : conversation?.mode === "message"
      ? config?.emailReplies
        ? strings.emailRepliesNotice(email)
        : strings.inAppRepliesNotice
      : null;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        // Inverted, so the newest message sits at the bottom and the list opens there.
        inverted
        data={[...messages].reverse()}
        keyExtractor={(m) => m.clientId + m.senderType}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel="Messages"
        renderItem={({ item }) => (
          <Bubble
            message={item}
            theme={theme}
            onRetry={() => (conversation ? void client.retry(item) : void client.retryStart())}
            onExpired={() => conversation && client.linkExpired(conversation.id)}
          />
        )}
        // Inverted: the "header" renders at the bottom, the "footer" at the top.
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {clydeWriting && (
              <VText muted style={{ fontSize: 13 }} accessibilityLiveRegion="polite">
                {strings.assistantTyping}
              </VText>
            )}
            {closed && (
              <View style={styles.ended}>
                <VText muted>{strings.conversationEnded}</VText>
                <Button title={strings.startNew} theme={theme} onPress={() => client.goHome()} />
              </View>
            )}
          </View>
        }
        ListFooterComponent={
          notice ? (
            <View style={[styles.notice, { backgroundColor: theme.surface, borderRadius: theme.radius - 4 }]}>
              <VText muted style={{ fontSize: 13, textAlign: "center" }}>
                {notice}
              </VText>
            </View>
          ) : undefined
        }
      />
      {!closed && <Composer draft={draft} setDraft={setDraft} onSend={send} disabled={!conversation} />}
    </View>
  );
}

function Bubble({
  message,
  theme,
  onRetry,
  onExpired,
}: {
  message: Message;
  theme: VurpTheme;
  onRetry: () => void;
  onExpired: () => void;
}) {
  const { strings } = useVurpUi();
  const mine = message.senderType === "visitor";
  const failed = message.state === "failed";
  const bubble = {
    backgroundColor: mine ? theme.brand : theme.surface,
    borderRadius: theme.radius,
    borderBottomRightRadius: mine ? 6 : theme.radius,
    borderBottomLeftRadius: mine ? theme.radius : 6,
    opacity: failed ? 0.6 : 1,
  };

  if (message.senderType === "system") {
    return (
      <VText muted style={{ fontSize: 12, textAlign: "center" }}>
        {message.body}
      </VText>
    );
  }

  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start", gap: 4 }}>
      {!mine && message.senderName && (
        <VText muted style={{ fontSize: 12, marginLeft: 4 }}>
          {message.senderType === "ai"
            ? `${message.senderName} · ${strings.assistantTag}`
            : message.senderName}
        </VText>
      )}
      {message.attachments.map((a) => (
        <AttachmentView key={a.id} attachment={a} theme={theme} onExpired={onExpired} />
      ))}
      {!!message.body && (
        <View style={[styles.bubble, bubble]}>
          <VText selectable style={{ color: mine ? theme.onBrand : theme.text }}>
            {message.body}
          </VText>
        </View>
      )}
      {message.state === "sending" ? (
        <VText muted style={styles.meta}>
          {strings.sending}
        </VText>
      ) : failed ? (
        <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8}>
          <VText style={[styles.meta, { color: theme.danger }]}>
            {strings.notSent}{" "}
            <VText style={[styles.meta, { color: theme.danger, textDecorationLine: "underline" }]}>
              {strings.retry}
            </VText>
          </VText>
        </Pressable>
      ) : (
        <VText muted style={styles.meta}>
          {when(message.createdAt)}
        </VText>
      )}
    </View>
  );
}

/** A photo, or a video that opens in the phone's player. Links expire, so a failed load asks for fresh ones. */
function AttachmentView({
  attachment: a,
  theme,
  onExpired,
}: {
  attachment: Attachment;
  theme: VurpTheme;
  onExpired: () => void;
}) {
  const { strings } = useVurpUi();
  const card = [styles.fileCard, { backgroundColor: theme.surface, borderRadius: theme.radius - 4 }];
  if (a.expired || !a.url) {
    return (
      <View style={card}>
        <VText style={{ fontSize: 13 }}>{a.fileName}</VText>
        {a.expired && (
          <VText muted style={{ fontSize: 12 }}>
            {strings.fileUnavailable}
          </VText>
        )}
      </View>
    );
  }
  const url = a.url;
  if (a.kind === "video") {
    return (
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(url)} style={card}>
        <VText bold style={{ fontSize: 13, color: theme.brand }}>
          ▶ {strings.openVideo}
        </VText>
        <VText muted numberOfLines={1} style={{ fontSize: 12 }}>
          {a.fileName}
        </VText>
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={a.fileName}
      onPress={() => void Linking.openURL(url)}
    >
      <Image
        source={{ uri: url }}
        onError={onExpired}
        resizeMode="cover"
        style={{ width: 220, height: 220, borderRadius: theme.radius - 4, backgroundColor: theme.surface }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: "82%", paddingHorizontal: 14, paddingVertical: 9 },
  meta: { fontSize: 11, marginHorizontal: 4 },
  notice: { padding: 12, marginBottom: 6 },
  ended: { alignItems: "center", gap: 12, paddingVertical: 12 },
  fileCard: { padding: 12, gap: 2, maxWidth: 240 },
});
