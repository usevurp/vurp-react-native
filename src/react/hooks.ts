import { useMemo, useSyncExternalStore } from "react";
import { useColorScheme } from "react-native";
import type { VurpClient } from "../core/client";
import type { VurpState } from "../core/types";
import { buildTheme, resolveDark, type VurpTheme } from "../ui/theme";
import { useUi } from "./ui-context";

/**
 * The Vurp client: open(), close(), identify(), logout(), setPushToken(), handleNotification(),
 * and everything a custom UI needs (startConversation, send, openConversation…).
 */
export function useVurp(): VurpClient {
  return useUi().client;
}

/**
 * Vurp's state, re-rendering when it changes. Pass a selector to re-render only when that part
 * changes: useVurpState((s) => s.unread). Selectors should return a value from the state (or a
 * primitive), not build a new object each time.
 */
export function useVurpState(): VurpState;
export function useVurpState<T>(selector: (state: VurpState) => T): T;
export function useVurpState<T>(selector?: (state: VurpState) => T) {
  const { client } = useUi();
  const get = () => (selector ? selector(client.state) : client.state);
  return useSyncExternalStore((listener) => client.subscribe(listener), get, get);
}

/** Unread replies across the visitor's conversations, for a badge on your own chat button. */
export function useVurpUnread() {
  return useVurpState((s) => s.unread);
}

/** The messenger's resolved colours and fonts, for building custom pieces that match. */
export function useVurpTheme(): VurpTheme {
  const { themeOverrides, colorScheme } = useUi();
  const config = useVurpState((s) => s.config);
  const system = useColorScheme();
  const dark = resolveDark(colorScheme, config, system);
  return useMemo(() => buildTheme(config, dark, themeOverrides), [config, dark, themeOverrides]);
}

/** @internal The built-in UI's settings. */
export const useVurpUi = useUi;
