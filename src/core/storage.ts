/**
 * Where the SDK keeps the visitor's session token, profile and cached settings. Compatible with
 * AsyncStorage; wrap MMKV, expo-secure-store or anything else in these three methods.
 */
export type VurpStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

// Metro provides require at runtime; declared here so the SDK needs no Node types.
declare const require: (id: string) => unknown;

/** Lasts until the app closes: every launch is a new visitor. */
export function memoryStorage(): VurpStorage {
  const items = new Map<string, string>();
  return {
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => void items.set(key, value),
    removeItem: async (key) => void items.delete(key),
  };
}

/**
 * AsyncStorage when the app has it installed (Expo apps and most React Native apps do), otherwise
 * memory. Metro allows a require of a missing module inside try/catch, so this stays optional.
 */
export function defaultStorage(): VurpStorage {
  try {
    const module = require("@react-native-async-storage/async-storage") as
      { default?: VurpStorage } | undefined;
    const storage = (module?.default ?? module) as VurpStorage | undefined;
    if (storage?.getItem) return storage;
  } catch {
    // Not installed.
  }
  console.warn(
    "[Vurp] @react-native-async-storage/async-storage isn't installed, so chats won't survive an app restart. Install it, or pass `storage` to VurpProvider.",
  );
  return memoryStorage();
}

/** A storage that never throws: a failing store shouldn't break chat. */
export function safe(storage: VurpStorage): VurpStorage {
  return {
    getItem: (key) => storage.getItem(key).catch(() => null),
    setItem: (key, value) => storage.setItem(key, value).catch(() => {}),
    removeItem: (key) => storage.removeItem(key).catch(() => {}),
  };
}
