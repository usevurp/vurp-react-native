import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { Button, Platform, StyleSheet, Text, View } from "react-native";
import {
  VurpLauncher,
  VurpProvider,
  useVurp,
  useVurpUnread,
  type Identity,
  type PickedFile,
  type PushProvider,
} from "@usevurp/react-native";

const PROJECT_ID = process.env.EXPO_PUBLIC_VURP_PROJECT_ID ?? "";
const API_URL = process.env.EXPO_PUBLIC_VURP_API_URL || undefined;

/** Photos and videos from the library, in the shape the SDK expects. */
async function pickFiles({ multiple }: { multiple: boolean }): Promise<PickedFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: multiple,
    quality: 0.8,
  });
  if (result.canceled) return [];
  return result.assets.map((a) => ({
    uri: a.uri,
    name: a.fileName ?? a.uri.split("/").pop() ?? "file",
    type: a.mimeType ?? (a.type === "video" ? "video/mp4" : "image/jpeg"),
    size: a.fileSize,
  }));
}

/**
 * The device's native push token: APNs on iOS, FCM on Android. Needs a development build
 * (npx expo run:ios / run:android), not Expo Go, and push credentials uploaded in Vurp.
 */
function useDevicePushToken() {
  const [push, setPush] = useState<{ provider: PushProvider; token: string } | null>(null);
  useEffect(() => {
    (async () => {
      const { granted } = await Notifications.requestPermissionsAsync();
      if (!granted) return;
      const token = await Notifications.getDevicePushTokenAsync();
      setPush({ provider: Platform.OS === "ios" ? "apns" : "fcm", token: String(token.data) });
    })().catch((err) => console.warn("Push token unavailable:", err));
  }, []);
  return push;
}

export default function App() {
  // In a real app this comes from your sign-in, with userHash computed on your server.
  const [identity, setIdentity] = useState<Identity | null>(null);
  const pushToken = useDevicePushToken();

  if (!PROJECT_ID.startsWith("proj_")) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Set EXPO_PUBLIC_VURP_PROJECT_ID</Text>
        <Text>Copy .env.example to .env and add your project ID. See README.md.</Text>
      </View>
    );
  }

  return (
    <VurpProvider
      projectId={PROJECT_ID}
      appId="com.usevurp.example"
      apiUrl={API_URL}
      identity={identity}
      pushToken={pushToken}
      pickFiles={pickFiles}
      colorScheme="system"
    >
      <Home signedIn={!!identity} onSignIn={setIdentity} />
      <VurpLauncher />
      <StatusBar style="auto" />
    </VurpProvider>
  );
}

function Home({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: (identity: Identity | null) => void }) {
  const vurp = useVurp();
  const unread = useVurpUnread();

  // Tapping a Vurp notification opens its conversation.
  const openFromNotification = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data;
      if (data) vurp.handleNotification(data);
    },
    [vurp],
  );
  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then(openFromNotification);
    const sub = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    return () => sub.remove();
  }, [openFromNotification]);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Vurp example</Text>
      <Button title={unread ? `Help (${unread} unread)` : "Help"} onPress={() => void vurp.open()} />
      {signedIn ? (
        <Button
          title="Sign out"
          onPress={async () => {
            // Ends the Vurp session too, so the next person doesn't see these chats.
            await vurp.logout();
            onSignIn(null);
          }}
        />
      ) : (
        <Text style={styles.note}>
          To try signed-in chat, pass an identity with a userHash from your server (see README).
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  title: { fontSize: 22, fontWeight: "700" },
  note: { textAlign: "center", color: "#71717A" },
});
