import { useState } from "react";
import { Image, StyleSheet, TextInput, View } from "react-native";
import { useVurp, useVurpState, useVurpTheme, useVurpUi } from "../react/hooks";
import type { VurpState } from "../core/types";
import { CloseIcon, IconButton, PlusIcon, SendIcon, VText } from "./parts";

export const canSend = (state: Pick<VurpState, "files">, draft: string) =>
  !state.files.some((f) => f.state === "uploading") &&
  (!!draft.trim() || state.files.some((f) => f.state === "ready"));

/** The message box, with the attach button and the files waiting to go. */
export function Composer({
  draft,
  setDraft,
  onSend,
  disabled,
  autoFocus,
}: {
  draft: string;
  setDraft: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const client = useVurp();
  const theme = useVurpTheme();
  const { strings, pickFiles } = useVurpUi();
  const files = useVurpState((s) => s.files);
  const fileError = useVurpState((s) => s.fileError);
  const limits = useVurpState((s) => s.attachmentLimits);
  const [height, setHeight] = useState(40);
  const sendable = !disabled && canSend({ files }, draft);

  const attach = async () => {
    if (!pickFiles) return;
    try {
      const picked = await pickFiles({ multiple: limits.perMessage !== 1 });
      if (picked.length) client.addFiles(picked);
    } catch (err) {
      console.warn(`[Vurp] pickFiles failed: ${err instanceof Error ? err.message : err}`);
    }
  };

  return (
    <View style={[styles.wrap, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
      {files.length > 0 && (
        <View style={styles.files} accessibilityLabel="Files to send">
          {files.map((f) => (
            <View
              key={f.localId}
              style={[
                styles.file,
                {
                  borderColor: f.state === "failed" ? theme.danger : theme.border,
                  backgroundColor: theme.surface,
                },
              ]}
            >
              {f.kind === "image" ? (
                <Image source={{ uri: f.uri }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, { backgroundColor: theme.border }]} />
              )}
              <View style={{ flex: 1 }}>
                <VText numberOfLines={1} style={{ fontSize: 13 }}>
                  {f.name}
                </VText>
                <VText
                  muted
                  numberOfLines={2}
                  style={{ fontSize: 12, color: f.state === "failed" ? theme.danger : undefined }}
                >
                  {f.state === "uploading"
                    ? strings.uploading(Math.round(f.progress * 100))
                    : f.state === "failed"
                      ? f.error
                      : strings.readyToSend}
                </VText>
              </View>
              <IconButton label={strings.remove(f.name)} onPress={() => client.removeFile(f.localId)}>
                <CloseIcon color={theme.textMuted} size={12} />
              </IconButton>
            </View>
          ))}
        </View>
      )}
      {fileError && (
        <VText
          accessibilityRole="alert"
          style={{ color: theme.danger, fontSize: 13, paddingHorizontal: 4, paddingBottom: 6 }}
        >
          {fileError}
        </VText>
      )}
      <View style={styles.row}>
        {pickFiles && limits.enabled && (
          <IconButton label={strings.attach} onPress={attach} disabled={disabled}>
            <PlusIcon color={theme.textMuted} size={18} />
          </IconButton>
        )}
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={strings.messagePlaceholder}
          placeholderTextColor={theme.textMuted}
          accessibilityLabel={strings.messagePlaceholder}
          multiline
          maxLength={4000}
          editable={!disabled}
          autoFocus={autoFocus}
          onContentSizeChange={(e) =>
            setHeight(Math.min(120, Math.max(40, e.nativeEvent.contentSize.height + 16)))
          }
          style={[
            styles.input,
            {
              height,
              backgroundColor: theme.surface,
              color: theme.text,
              fontFamily: theme.fontFamily,
              borderRadius: Math.min(20, theme.radius + 2),
            },
          ]}
        />
        <IconButton
          label={strings.send}
          onPress={onSend}
          disabled={!sendable}
          style={{ backgroundColor: sendable ? theme.brand : theme.surface }}
        >
          <SendIcon color={sendable ? theme.onBrand : theme.textMuted} size={16} />
        </IconButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    textAlignVertical: "top",
  },
  files: { gap: 6, paddingBottom: 8 },
  file: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: { width: 36, height: 36, borderRadius: 8 },
});
