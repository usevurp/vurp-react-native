import { Modal, Platform, StatusBar } from "react-native";
import { useVurp, useVurpState, useVurpUi } from "../react/hooks";
import { VurpMessenger } from "./VurpMessenger";

declare const require: (id: string) => unknown;

/**
 * The device's safe-area insets when react-native-safe-area-context is installed (it is in most
 * apps, and in every Expo app). Read once at launch; optional, like AsyncStorage.
 */
function deviceInsets() {
  try {
    const context = require("react-native-safe-area-context") as {
      initialWindowMetrics?: { insets: { top: number; bottom: number } } | null;
    };
    const insets = context.initialWindowMetrics?.insets;
    if (insets) return { top: insets.top, bottom: insets.bottom };
  } catch {
    // Not installed.
  }
  return null;
}

const DEVICE_INSETS = deviceInsets();

/** The built-in messenger over the app, shown by open(). Rendered by VurpProvider. */
export function VurpModal() {
  const client = useVurp();
  const visible = useVurpState((s) => s.visible);
  const ui = useVurpUi();

  // iOS shows a page sheet, which already starts below the status bar. Android draws edge to edge.
  const ios = Platform.OS === "ios";
  const insets = ui.insets ?? {
    top: ios ? 0 : (DEVICE_INSETS?.top ?? StatusBar.currentHeight ?? 0),
    bottom: DEVICE_INSETS?.bottom ?? 0,
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={ios ? "pageSheet" : undefined}
      statusBarTranslucent
      navigationBarTranslucent
      // Android back button and iOS swipe-down both close it.
      onRequestClose={() => client.close()}
    >
      <VurpMessenger insets={insets} />
    </Modal>
  );
}
