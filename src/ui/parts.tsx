import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { useVurpTheme } from "../react/hooks";
import type { VurpTheme } from "./theme";

// Small building blocks for the messenger. Icons are drawn with Views, so the SDK needs no native
// SVG or icon-font module.

/** Text in the messenger's font and colour. */
export function VText({ style, bold, muted, ...props }: TextProps & { bold?: boolean; muted?: boolean }) {
  const theme = useVurpTheme();
  return (
    <Text
      {...props}
      style={[
        {
          color: muted ? theme.textMuted : theme.text,
          fontFamily: bold ? (theme.fontFamilyBold ?? theme.fontFamily) : theme.fontFamily,
          fontWeight: bold && !theme.fontFamilyBold ? "600" : undefined,
          fontSize: 15,
        },
        style,
      ]}
    />
  );
}

const bar = (color: string, width: number, rotate: string): ViewStyle => ({
  position: "absolute",
  width,
  height: 2,
  borderRadius: 1,
  backgroundColor: color,
  transform: [{ rotate }],
});

export function CloseIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={bar(color, size * 1.1, "45deg")} />
      <View style={bar(color, size * 1.1, "-45deg")} />
    </View>
  );
}

export function ChevronIcon({
  color,
  size = 12,
  direction = "left",
}: {
  color: string;
  size?: number;
  direction?: "left" | "down" | "up";
}) {
  const rotate = { left: "45deg", down: "-45deg", up: "135deg" }[direction];
  return (
    <View style={{ width: size * 1.4, height: size * 1.4, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: size,
          height: size,
          borderLeftWidth: 2,
          borderBottomWidth: 2,
          borderColor: color,
          transform: [{ rotate }],
          marginLeft: direction === "left" ? size * 0.35 : 0,
          marginTop: direction === "down" ? -size * 0.35 : direction === "up" ? size * 0.35 : 0,
        }}
      />
    </View>
  );
}

export function PlusIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={bar(color, size, "0deg")} />
      <View style={bar(color, size, "90deg")} />
    </View>
  );
}

/** An arrow pointing up: the send button. */
export function SendIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "flex-start" }}>
      <ChevronIcon color={color} size={size * 0.55} direction="up" />
      <View
        style={{
          position: "absolute",
          top: size * 0.15,
          width: 2,
          height: size * 0.85,
          borderRadius: 1,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** A speech bubble: the launcher. */
export function ChatIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: size * 0.9,
          height: size * 0.72,
          borderRadius: size * 0.36,
          borderWidth: 2,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: size * 0.02,
          left: size * 0.2,
          width: size * 0.22,
          height: size * 0.22,
          borderLeftWidth: 2,
          borderBottomWidth: 2,
          borderColor: color,
          transform: [{ skewY: "-20deg" }],
        }}
      />
    </View>
  );
}

/** A round icon button with a 44pt touch target. */
export function IconButton({
  label,
  onPress,
  children,
  style,
  disabled,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  theme,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  theme: VurpTheme;
  variant?: "primary" | "secondary";
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? theme.brand : theme.surface,
          borderColor: primary ? theme.brand : theme.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <VText bold style={{ color: primary ? theme.onBrand : theme.text, fontSize: 15 }}>
        {title}
      </VText>
    </Pressable>
  );
}

export function Loading({ label }: { label: string }) {
  const theme = useVurpTheme();
  return (
    <View style={styles.center} accessibilityLabel={label} accessibilityState={{ busy: true }}>
      <ActivityIndicator color={theme.brand} />
    </View>
  );
}

export function Badge({ count, theme }: { count: number; theme: VurpTheme }) {
  return (
    <View style={[styles.badge, { backgroundColor: theme.danger }]}>
      <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  button: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
});

const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

/** "14:05" today, "3 Nov" before. */
export function when(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString() ? time.format(date) : day.format(date);
}
