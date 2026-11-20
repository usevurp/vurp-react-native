import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useVurp, useVurpState, useVurpTheme, useVurpUi } from "../react/hooks";
import { canSend, Composer } from "./Composer";
import { Badge, VText, when } from "./parts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The start screen: availability, earlier conversations, prompts, and the first message. */
export function HomeView() {
  const client = useVurp();
  const theme = useVurpTheme();
  const { strings } = useVurpUi();
  const state = useVurpState();
  const config = state.config!;
  const [email, setEmail] = useState(state.profile.email);
  const [name, setName] = useState(state.profile.name);
  const [editingProfile, setEditingProfile] = useState(!state.profile.email);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const availabilityText = { online: config.onlineText, busy: config.busyText, offline: config.offlineText }[
    state.availability
  ];

  const start = () => {
    if (!canSend(state, draft)) return;
    // Vurp needs an email before the first message; it's unverified, so only its shape is checked.
    if (!EMAIL.test(email.trim())) {
      setError(strings.emailRequired);
      setEditingProfile(true);
      return;
    }
    setError(null);
    void client.startConversation(draft.trim(), { email: email.trim(), name: name.trim() });
    setDraft("");
  };

  const input = [
    styles.field,
    {
      backgroundColor: theme.surface,
      color: theme.text,
      fontFamily: theme.fontFamily,
      borderColor: error ? theme.danger : theme.border,
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.availability} accessibilityRole="text">
          <View style={[styles.dot, { backgroundColor: theme[state.availability] }]} />
          <VText muted style={{ flex: 1, fontSize: 14 }}>
            {availabilityText}
          </VText>
        </View>

        {config.whatsappNumber && (
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              void Linking.openURL(
                `https://wa.me/${config.whatsappNumber!.replace(/\D/g, "")}?text=${encodeURIComponent(strings.whatsappMessage)}`,
              )
            }
            style={({ pressed }) => [
              styles.card,
              { borderColor: theme.border, borderRadius: theme.radius - 4, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={[styles.whatsappLogo]}>
              <VText bold style={{ color: "#FFFFFF", fontSize: 13 }}>
                WA
              </VText>
            </View>
            <View style={{ flex: 1 }}>
              <VText bold>{strings.whatsappTitle}</VText>
              <VText muted style={{ fontSize: 13 }}>
                {strings.whatsappBody}
              </VText>
            </View>
          </Pressable>
        )}

        {state.conversations.length > 0 && (
          <View style={{ gap: 6 }}>
            <VText muted bold style={styles.label}>
              {strings.yourConversations}
            </VText>
            {state.conversations.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => void client.openConversation(c.id)}
                style={({ pressed }) => [
                  styles.card,
                  { borderColor: theme.border, borderRadius: theme.radius - 4, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <VText numberOfLines={1} style={{ flex: 1 }}>
                  {c.lastMessagePreview ?? strings.conversationFallback}
                </VText>
                <VText muted style={{ fontSize: 12 }}>
                  {c.status === "closed" ? strings.ended : when(c.lastMessageAt)}
                </VText>
                {c.unread > 0 && <Badge count={c.unread} theme={theme} />}
              </Pressable>
            ))}
          </View>
        )}

        {config.introPrompts.length > 0 && (
          <View style={styles.prompts}>
            {config.introPrompts.map((prompt) => (
              <Pressable
                key={prompt}
                accessibilityRole="button"
                onPress={() => setDraft(prompt)}
                style={({ pressed }) => [
                  styles.prompt,
                  { borderColor: theme.brand, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <VText style={{ color: theme.brand, fontSize: 14 }}>{prompt}</VText>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.profile, { borderTopColor: theme.border }]}>
        {editingProfile ? (
          <View style={{ gap: 8 }}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={strings.emailPlaceholder}
              placeholderTextColor={theme.textMuted}
              accessibilityLabel={strings.emailPlaceholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              style={input}
            />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={strings.namePlaceholder}
              placeholderTextColor={theme.textMuted}
              accessibilityLabel={strings.namePlaceholder}
              autoComplete="name"
              textContentType="name"
              style={[input, { borderColor: theme.border }]}
            />
          </View>
        ) : (
          <VText muted style={{ fontSize: 13 }}>
            {strings.chattingAs(state.profile.email)}{" "}
            <VText
              style={{ fontSize: 13, color: theme.brand }}
              onPress={() => setEditingProfile(true)}
              accessibilityRole="button"
            >
              {strings.change}
            </VText>
          </VText>
        )}
        {(error || state.startError) && (
          <VText accessibilityRole="alert" style={{ color: theme.danger, fontSize: 13, marginTop: 6 }}>
            {error ?? state.startError}
          </VText>
        )}
      </View>
      <Composer draft={draft} setDraft={setDraft} onSend={start} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 16 },
  availability: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  whatsappLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
  },
  prompts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  prompt: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1 },
  profile: { paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  field: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
