// @usevurp/react-native: Vurp live chat for React Native and Expo apps.

export { VurpProvider, type VurpProviderProps } from "./react/provider";
export { useVurp, useVurpState, useVurpTheme, useVurpUnread } from "./react/hooks";
export { VurpMessenger, type VurpMessengerProps } from "./ui/VurpMessenger";
export { VurpLauncher, type VurpLauncherProps } from "./ui/VurpLauncher";

export { VurpClient, DEFAULT_API_URL, type VurpClientOptions, type VurpEvent } from "./core/client";
export { VurpApiError, SDK_VERSION } from "./core/api";
export { parseNotification, type VurpNotification } from "./core/notifications";
export { memoryStorage, type VurpStorage } from "./core/storage";
export { DEFAULT_STRINGS, type VurpStrings } from "./ui/strings";
export type { VurpTheme, VurpThemeOverrides, VurpColorScheme } from "./ui/theme";
export type {
  Attachment,
  AttachmentLimits,
  Availability,
  Conversation,
  Faq,
  FaqCategory,
  Faqs,
  Identity,
  Message,
  PendingFile,
  PickedFile,
  Profile,
  PushProvider,
  VurpState,
  WidgetConfig,
} from "./core/types";
