import { createContext, useContext } from "react";
import type { VurpClient } from "../core/client";
import type { PickedFile } from "../core/types";
import type { VurpStrings } from "../ui/strings";
import type { VurpColorScheme, VurpThemeOverrides } from "../ui/theme";

export type Insets = { top: number; bottom: number };

export type UiContext = {
  client: VurpClient;
  themeOverrides: VurpThemeOverrides;
  colorScheme: VurpColorScheme;
  strings: VurpStrings;
  pickFiles?: (options: { multiple: boolean }) => Promise<PickedFile[]>;
  insets?: Insets;
};

export const Context = createContext<UiContext | null>(null);

export function useUi() {
  const ui = useContext(Context);
  if (!ui) throw new Error("[Vurp] Wrap your app in <VurpProvider> to use Vurp.");
  return ui;
}
