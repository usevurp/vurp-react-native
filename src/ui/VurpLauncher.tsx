import { useEffect } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useVurp, useVurpState, useVurpTheme, useVurpUi } from "../react/hooks";
import { Badge, ChatIcon } from "./parts";

export type VurpLauncherProps = {
  /** Where to float it. Defaults to the corner chosen in the Vurp dashboard, 24pt from the edges. */
  style?: StyleProp<ViewStyle>;
  /** Your own content instead of the chat icon. */
  children?: React.ReactNode;
  size?: number;
};

/**
 * A floating chat button with an unread badge, in the brand colour. Optional: call open() from
 * any button of your own instead, with useVurpUnread() for the badge.
 */
export function VurpLauncher({ style, children, size = 56 }: VurpLauncherProps) {
  const client = useVurp();
  const theme = useVurpTheme();
  const { strings } = useVurpUi();
  const unread = useVurpState((s) => s.unread);
  const config = useVurpState((s) => s.config);
  const phase = useVurpState((s) => s.phase);

  // Settings are cached after the first launch; on the very first, load them for the colour.
  useEffect(() => {
    if (!config && phase === "idle") void client.ensureReady();
  }, [client, config, phase]);

  const corner = config?.position ?? "bottom_right";
  const placement: ViewStyle = {
    position: "absolute",
    [corner.startsWith("top") ? "top" : "bottom"]: 24,
    [corner.endsWith("left") ? "left" : "right"]: 24,
  };

  return (
    <View style={[placement, style]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={unread ? `${strings.openChat}, ${unread} unread` : strings.openChat}
        onPress={() => void client.open()}
        style={({ pressed }) => [
          styles.button,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.brand,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {children ?? <ChatIcon color={theme.onBrand} size={size * 0.45} />}
      </Pressable>
      {unread > 0 && (
        <View style={styles.badge} pointerEvents="none">
          <Badge count={unread} theme={theme} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  badge: { position: "absolute", top: -4, right: -4 },
});
