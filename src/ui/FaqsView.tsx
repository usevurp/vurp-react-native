import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { Faqs } from "../core/types";
import { useVurp, useVurpTheme, useVurpUi } from "../react/hooks";
import { htmlToBlocks, type Block } from "./html";
import { Button, ChevronIcon, Loading, VText } from "./parts";

/** Published FAQs, by category, each answer opening in place. */
export function FaqsView({ onChat }: { onChat: () => void }) {
  const client = useVurp();
  const theme = useVurpTheme();
  const { strings } = useVurpUi();
  const [faqs, setFaqs] = useState<Faqs | null>(null);
  const [failed, setFailed] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    client
      .loadFaqs()
      .then((f) => live && setFaqs(f))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [client]);

  const shown = useMemo(
    () => (faqs?.faqs ?? []).filter((f) => !category || f.categoryId === category),
    [faqs, category],
  );

  if (failed) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <VText muted>{strings.faqsError}</VText>
      </View>
    );
  }
  if (!faqs) return <Loading label={strings.loading} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {faqs.categories.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[{ id: null, name: strings.faqsAll }, ...faqs.categories].map((c) => {
            const selected = category === c.id;
            return (
              <Pressable
                key={c.id ?? "all"}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setCategory(c.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.brand : theme.surface,
                    borderColor: selected ? theme.brand : theme.border,
                  },
                ]}
              >
                <VText style={{ fontSize: 13, color: selected ? theme.onBrand : theme.text }}>{c.name}</VText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {shown.length === 0 && <VText muted>{strings.faqsEmpty}</VText>}

      {shown.map((f) => {
        const expanded = open === f.id;
        return (
          <View
            key={f.id}
            style={[styles.item, { borderColor: theme.border, borderRadius: theme.radius - 4 }]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setOpen(expanded ? null : f.id)}
              style={styles.question}
            >
              <VText bold style={{ flex: 1 }}>
                {f.question}
              </VText>
              <ChevronIcon color={theme.textMuted} size={8} direction={expanded ? "up" : "down"} />
            </Pressable>
            {expanded && <Answer blocks={htmlToBlocks(f.answerHtml)} />}
          </View>
        );
      })}

      <View style={{ alignItems: "center", gap: 10, paddingVertical: 12 }}>
        <VText muted>{strings.faqsStillNeedHelp}</VText>
        <Button title={strings.faqsChat} theme={theme} onPress={onChat} />
      </View>
    </ScrollView>
  );
}

function Answer({ blocks }: { blocks: Block[] }) {
  const theme = useVurpTheme();
  return (
    <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
      {blocks.map((block, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 6 }}>
          {block.kind !== "paragraph" && (
            <VText muted>{block.kind === "bullet" ? "•" : `${block.index}.`}</VText>
          )}
          <VText style={{ flex: 1, lineHeight: 21 }}>
            {block.runs.map((run, j) => (
              <VText
                key={j}
                bold={run.bold}
                style={[
                  { lineHeight: 21 },
                  run.italic && { fontStyle: "italic" },
                  run.href && { color: theme.brand, textDecorationLine: "underline" },
                ]}
                onPress={run.href ? () => void Linking.openURL(run.href!) : undefined}
                accessibilityRole={run.href ? "link" : undefined}
              >
                {run.text}
              </VText>
            ))}
          </VText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: { borderWidth: StyleSheet.hairlineWidth },
  question: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
});
