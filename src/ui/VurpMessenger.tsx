import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useVurp, useVurpState, useVurpTheme, useVurpUi } from "../react/hooks";
import { ConversationView } from "./ConversationView";
import { FaqsView } from "./FaqsView";
import { HomeView } from "./HomeView";
import { Button, ChevronIcon, CloseIcon, IconButton, Loading, VText } from "./parts";

export type VurpMessengerProps = {
  /** Called by the close button. Defaults to client.close(); pass your navigator's goBack() when embedded. */
  onClose?: () => void;
  /** Hide the close button, for a messenger that's a tab in your app. */
  hideClose?: boolean;
  /** Space to leave for the status bar and home indicator, when your screen doesn't already. */
  insets?: { top: number; bottom: number };
  /** How far your header or navigation pushes this view down, for the keyboard. */
  keyboardVerticalOffset?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * The whole messenger as a view. VurpProvider shows it in a modal for you; render it yourself to
 * put the chat in a screen, a tab or a sheet of your own (with presentation="none").
 */
export function VurpMessenger({
  onClose,
  hideClose,
  insets,
  keyboardVerticalOffset = 0,
  style,
}: VurpMessengerProps) {
  const client = useVurp();
  const theme = useVurpTheme();
  const { strings } = useVurpUi();
  const phase = useVurpState((s) => s.phase);
  const config = useVurpState((s) => s.config);
  const current = useVurpState((s) => s.current);
  const starting = useVurpState((s) => s.starting);
  const conversation = useVurpState((s) => s.conversations.find((c) => c.id === s.current) ?? null);
  const [tab, setTab] = useState<"chat" | "faqs">("chat");
  const close = onClose ?? (() => client.close());

  // Embedded messengers aren't opened with open(), so they load themselves.
  useEffect(() => {
    if (phase === "idle") void client.ensureReady();
  }, [client, phase]);

  const inConversation = tab === "chat" && (!!current || !!starting);
  const title = config?.title ?? "";

  return (
    <View style={[{ flex: 1, backgroundColor: theme.background, paddingBottom: insets?.bottom ?? 0 }, style]}>
      <View
        style={[
          styles.head,
          { backgroundColor: theme.brand, paddingTop: (insets?.top ?? 0) + 10 },
          inConversation && styles.compact,
        ]}
      >
        <View style={styles.headRow}>
          {inConversation && (
            <IconButton label={strings.back} onPress={() => client.goHome()}>
              <ChevronIcon color={theme.onBrand} size={10} />
            </IconButton>
          )}
          <VText
            bold
            numberOfLines={1}
            accessibilityRole="header"
            style={{ flex: 1, color: theme.onBrand, fontSize: 17 }}
          >
            {title}
          </VText>
          {!hideClose && (
            <IconButton label={strings.close} onPress={close}>
              <CloseIcon color={theme.onBrand} size={14} />
            </IconButton>
          )}
        </View>
        {!inConversation && config && (
          <View style={{ gap: 4, paddingTop: 8 }}>
            <VText bold style={{ color: theme.onBrand, fontSize: 24 }}>
              {config.welcomeText}
            </VText>
            {!!config.greetingText && (
              <VText style={{ color: theme.onBrand, opacity: 0.85, fontSize: 15 }}>
                {config.greetingText}
              </VText>
            )}
          </View>
        )}
      </View>

      {!inConversation && (
        <View style={[styles.tabs, { borderBottomColor: theme.border }]} accessibilityRole="tablist">
          {(["chat", "faqs"] as const).map((name) => (
            <Pressable
              key={name}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === name }}
              onPress={() => setTab(name)}
              style={[styles.tab, { borderBottomColor: tab === name ? theme.brand : "transparent" }]}
            >
              <VText bold={tab === name} muted={tab !== name}>
                {name === "chat" ? strings.chatTab : strings.faqsTab}
              </VText>
            </Pressable>
          ))}
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {tab === "faqs" && !inConversation ? (
          <FaqsView onChat={() => setTab("chat")} />
        ) : phase === "unavailable" ? (
          <View style={styles.empty}>
            <VText bold>{strings.unavailableTitle}</VText>
            <VText muted style={{ textAlign: "center" }}>
              {strings.unavailableBody}
            </VText>
            <Button
              title={strings.retry}
              theme={theme}
              variant="secondary"
              onPress={() => void client.ensureReady()}
            />
          </View>
        ) : phase !== "ready" || !config ? (
          <Loading label={strings.loading} />
        ) : inConversation ? (
          <ConversationView conversation={conversation} />
        ) : (
          <HomeView />
        )}
      </KeyboardAvoidingView>

      {config?.showBranding && (
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL("https://usevurp.com")}
          style={styles.branding}
        >
          <VText muted style={{ fontSize: 11 }}>
            {strings.poweredBy}
          </VText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 12, paddingBottom: 20 },
  compact: { paddingBottom: 10 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36, paddingLeft: 4 },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  branding: { alignItems: "center", paddingVertical: 6 },
});
