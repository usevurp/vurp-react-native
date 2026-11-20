import { useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";
import { VurpClient, type VurpEvent } from "../core/client";
import { defaultStorage, type VurpStorage } from "../core/storage";
import type { Identity, PickedFile, PushProvider } from "../core/types";
import { DEFAULT_STRINGS, type VurpStrings } from "../ui/strings";
import type { VurpColorScheme, VurpThemeOverrides } from "../ui/theme";
import { VurpModal } from "../ui/VurpModal";
import { Context, type Insets, type UiContext } from "./ui-context";

export type VurpProviderProps = {
  /** The website's project ID (proj_…), from Vurp → Websites → Install. */
  projectId: string;
  /**
   * This app's bundle ID (iOS) and package name (Android), exactly as added under Websites → Apps.
   * One string if they're the same.
   */
  appId: string | { ios?: string; android?: string };
  /** Who's signed in to your app, or null. Changing it switches the chat to that person. */
  identity?: Identity | null;
  /** This device's push token, so replies reach people when the app is closed. */
  pushToken?: { provider: PushProvider; token: string } | null;
  /** Colours, radius and fonts. Anything left out comes from the Vurp dashboard or the defaults. */
  theme?: VurpThemeOverrides;
  /** Light or dark. "dashboard" (the default) follows the setting in Vurp. */
  colorScheme?: VurpColorScheme;
  /** Your own wording or another language for the messenger's fixed text. */
  strings?: Partial<VurpStrings>;
  /**
   * Lets visitors send photos and videos: open your picker and return what was chosen (an empty
   * list if they cancelled). Without it there's no attach button. See the README for
   * expo-image-picker and react-native-image-picker examples.
   */
  pickFiles?: (options: { multiple: boolean }) => Promise<PickedFile[]>;
  /**
   * "modal" (the default): open() shows the messenger over your app. "none": nothing is shown for
   * you; put <VurpMessenger /> in a screen of your own (for example a navigation route) and open
   * that screen when `visible` turns true, or build your own UI with useVurpState().
   */
  presentation?: "modal" | "none";
  /** Safe-area insets for the modal. Worked out for you when react-native-safe-area-context is installed. */
  insets?: Insets;
  /** Where to keep the session. AsyncStorage when installed, otherwise memory. */
  storage?: VurpStorage;
  /** New messages, unread changes, open and close. */
  onEvent?: (event: VurpEvent) => void;
  apiUrl?: string;
  gatewayUrl?: string;
  children?: React.ReactNode;
};

function appIdFor(appId: VurpProviderProps["appId"]) {
  if (typeof appId === "string") return appId;
  const id = Platform.OS === "ios" ? appId.ios : appId.android;
  if (!id) throw new Error(`[Vurp] VurpProvider: appId has no ${Platform.OS} entry.`);
  return id;
}

/**
 * Connects your app to Vurp. Put it near the root of your app; anything inside can call useVurp().
 * Nothing is created on Vurp until the chat is first opened.
 */
export function VurpProvider(props: VurpProviderProps) {
  const { projectId, identity, pushToken, onEvent, presentation = "modal" } = props;
  const [client] = useState(
    () =>
      new VurpClient({
        projectId,
        appId: appIdFor(props.appId),
        platform: Platform.OS === "ios" ? "ios" : "android",
        apiUrl: props.apiUrl,
        gatewayUrl: props.gatewayUrl,
        storage: props.storage ?? defaultStorage(),
      }),
  );

  useEffect(() => {
    void client.start();
    const sub = AppState.addEventListener("change", (state) => client.setForeground(state === "active"));
    return () => {
      sub.remove();
      client.destroy();
    };
  }, [client]);

  // Declarative identity and push token: compared by value, so inline objects are fine.
  const identityKey = identity ? `${identity.userId}|${identity.userHash}|${identity.email ?? ""}` : "";
  useEffect(() => {
    void client.identify(identity ?? null);
  }, [client, identityKey]);

  const pushKey = pushToken ? `${pushToken.provider}|${pushToken.token}` : "";
  useEffect(() => {
    if (pushToken !== undefined) void client.setPushToken(pushToken);
  }, [client, pushKey]);

  useEffect(() => (onEvent ? client.on(onEvent) : undefined), [client, onEvent]);

  const ui = useMemo<UiContext>(
    () => ({
      client,
      themeOverrides: props.theme ?? {},
      colorScheme: props.colorScheme ?? "dashboard",
      strings: { ...DEFAULT_STRINGS, ...props.strings },
      pickFiles: props.pickFiles,
      insets: props.insets,
    }),
    [client, props.theme, props.colorScheme, props.strings, props.pickFiles, props.insets],
  );

  return (
    <Context.Provider value={ui}>
      {props.children}
      {presentation === "modal" && <VurpModal />}
    </Context.Provider>
  );
}
