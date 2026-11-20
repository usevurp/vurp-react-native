import type { WidgetConfig } from "../core/types";

/** Colours, shapes and fonts of the built-in messenger. Pass any of them to VurpProvider's `theme`. */
export type VurpTheme = {
  /** The business's colour: header, your messages, buttons. From the Vurp dashboard unless set here. */
  brand: string;
  /** Text and icons on the brand colour. Worked out for contrast unless set. */
  onBrand: string;
  background: string;
  /** Cards, inputs, other people's messages. */
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  danger: string;
  online: string;
  busy: string;
  offline: string;
  /** Corner radius of message bubbles and cards. */
  radius: number;
  /** Your app's font, if it has one. Leave unset for the system font. */
  fontFamily?: string;
  /** The bold variant, for fonts that ship weights as separate families. */
  fontFamilyBold?: string;
};

export type VurpThemeOverrides = Partial<VurpTheme> & {
  /** Overrides for dark mode only, applied after the rest. */
  dark?: Partial<VurpTheme>;
};

/** Light or dark: the dashboard's choice, the phone's setting, or always one of them. */
export type VurpColorScheme = "dashboard" | "system" | "light" | "dark";

const LIGHT = {
  background: "#FFFFFF",
  surface: "#F4F4F5",
  text: "#18181B",
  textMuted: "#71717A",
  border: "#E4E4E7",
};
const DARK = {
  background: "#18181B",
  surface: "#27272A",
  text: "#FAFAFA",
  textMuted: "#A1A1AA",
  border: "#3F3F46",
};

/** Black or white, whichever reads better on `hex` (WCAG relative luminance). */
export function readableOn(hex: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "#FFFFFF";
  const n = parseInt(match[1]!, 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  // Contrast against white vs. against black.
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? "#FFFFFF" : "#18181B";
}

export function resolveDark(
  scheme: VurpColorScheme,
  config: WidgetConfig | null,
  system: string | null | undefined,
) {
  if (scheme === "light" || scheme === "dark") return scheme === "dark";
  if (scheme === "system") return system === "dark";
  return config?.theme === "dark";
}

export function buildTheme(
  config: WidgetConfig | null,
  dark: boolean,
  overrides: VurpThemeOverrides = {},
): VurpTheme {
  const { dark: darkOverrides, ...base } = overrides;
  const brand = base.brand ?? (dark ? darkOverrides?.brand : undefined) ?? config?.brandColor ?? "#635BFF";
  const theme: VurpTheme = {
    brand,
    onBrand: readableOn(brand),
    ...(dark ? DARK : LIGHT),
    danger: "#DC2626",
    online: "#16A34A",
    busy: "#D97706",
    offline: "#A1A1AA",
    radius: 18,
    ...base,
    ...(dark ? darkOverrides : {}),
  };
  // A custom brand without a custom onBrand still gets readable text.
  if (!overrides.onBrand && !(dark && darkOverrides?.onBrand)) theme.onBrand = readableOn(theme.brand);
  return theme;
}
