# @usevurp/react-native

Vurp live chat in your React Native or Expo app. Your customers chat with your team (and Clyde AI) from inside the
app, and get a push notification when you reply. It uses the same inbox, settings and FAQs as your website's widget.

- **Ready-made messenger.** Call `open()` and a full chat screen slides up, styled from your Vurp dashboard.
- **Make it yours.** Override colours, fonts, corner radius and every piece of text, or put the messenger in a
  screen of your own.
- **Or build your own UI.** The same client powers hooks with all the state: conversations, messages, unread count.
- **No native code.** Works in Expo (including Expo Go for chat) and bare React Native, with no `pod install`
  for Vurp itself.

## 1. Add your app in Vurp

In the Vurp dashboard, open **Websites →** your website **→ Apps** and add your app:

- **iOS:** the bundle ID, for example `com.acme.shop`
- **Android:** the package name, for example `com.acme.shop`

Chat only loads in apps listed there. Copy your **project ID** (`proj_…`) from the same page.

## 2. Install

```sh
npm install @usevurp/react-native
npx expo install @react-native-async-storage/async-storage   # or: npm install it, then pod install
```

AsyncStorage keeps the chat session between launches. Without it, every launch starts a new visitor. To use MMKV or
another store instead, pass `storage` (see [Options](#options)).

## 3. Add the provider

```tsx
import { VurpProvider, VurpLauncher } from "@usevurp/react-native";

export default function App() {
  return (
    <VurpProvider projectId="proj_…" appId={{ ios: "com.acme.shop", android: "com.acme.shop" }}>
      <RootNavigator />
      <VurpLauncher /> {/* optional floating chat button */}
    </VurpProvider>
  );
}
```

Open the chat from anywhere:

```tsx
import { useVurp, useVurpUnread } from "@usevurp/react-native";

function HelpButton() {
  const vurp = useVurp();
  const unread = useVurpUnread();
  return <Button title={unread ? `Help (${unread})` : "Help"} onPress={() => vurp.open()} />;
}
```

Nothing is created on Vurp until someone opens the chat for the first time.

## Signed-in users

Tell Vurp who's signed in, so they see their conversation history on every device, and on your website too. This needs
**identity verification** on your Vurp plan.

```tsx
<VurpProvider projectId="proj_…" appId="com.acme.shop" identity={user ? vurpIdentity : null}>
```

`vurpIdentity` is `{ userId, email, userHash }`. Compute `userHash` **on your server** and send it to the app with the
signed-in user. Never put the identity secret in your app:

```js
// Node, on your server. The secret is in Vurp → Websites → Install → Identity verification.
const userHash = crypto.createHmac("sha256", process.env.VURP_IDENTITY_SECRET).update(user.id).digest("hex");
```

When the user signs out, end their chat session so the next person on the device starts fresh and doesn't get their
notifications:

```ts
await vurp.logout();
```

## Push notifications

When your team replies and the customer isn't in the chat, Vurp sends a push notification through **your app's own**
push credentials. Upload them under **Websites → Apps → Push**:

- **Android:** a Firebase service account JSON (Firebase console → Project settings → Service accounts).
- **iOS:** an APNs key (.p8) with its key ID and team ID, **or** the Firebase service account if your iOS app gets
  its tokens from Firebase Messaging.

Then give the SDK the device's token. Pass it each launch; it's sent whenever a chat session exists.

**With Expo (`expo-notifications`).** Native tokens need a development build, not Expo Go:

```tsx
const token = await Notifications.getDevicePushTokenAsync();
<VurpProvider pushToken={{ provider: Platform.OS === "ios" ? "apns" : "fcm", token: String(token.data) }} … />
```

**With React Native Firebase:**

```tsx
const token = await messaging().getToken();
<VurpProvider pushToken={{ provider: "fcm", token }} … />
```

**When a notification is tapped**, open its conversation. `handleNotification` returns `false` for notifications that
aren't Vurp's, so you can pass every tap through it:

```ts
// expo-notifications
Notifications.addNotificationResponseReceivedListener((response) => {
  vurp.handleNotification(response.notification.request.content.data);
});

// React Native Firebase
messaging().onNotificationOpenedApp((message) => vurp.handleNotification(message.data));
messaging().getInitialNotification().then((message) => message && vurp.handleNotification(message.data));
```

Vurp's notifications carry `{ vurp: "reply", conversationId, messageId, projectId }` in their data.
`vurp.isVurpNotification(data)` tells them apart, for example to hide them while the chat is on screen.

## Photos and videos

Pass a `pickFiles` function to show an attach button. It opens your picker and returns what was chosen. Sizes and
counts follow the business's Vurp plan.

```tsx
import * as ImagePicker from "expo-image-picker";

async function pickFiles({ multiple }) {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsMultipleSelection: multiple });
  if (result.canceled) return [];
  return result.assets.map((a) => ({ uri: a.uri, name: a.fileName ?? "photo.jpg", type: a.mimeType ?? "image/jpeg", size: a.fileSize }));
}

<VurpProvider pickFiles={pickFiles} … />
```

`react-native-image-picker` works the same way: map its `assets` to `{ uri, name, type, size }`.

## Customising

### Colours, fonts and text

The messenger starts from your dashboard's brand colour, light or dark theme, title and messages. Override anything:

```tsx
<VurpProvider
  theme={{
    brand: "#0F766E",
    radius: 12,
    fontFamily: "Inter-Regular",
    fontFamilyBold: "Inter-SemiBold",
    dark: { background: "#000000" }, // dark mode only
  }}
  colorScheme="system" // "dashboard" (default) | "system" | "light" | "dark"
  strings={{ messagePlaceholder: "Ask us anything…", faqsTab: "Help" }}
  …
/>
```

All the text keys are in [`src/ui/strings.ts`](src/ui/strings.ts), and all the theme keys in
[`src/ui/theme.ts`](src/ui/theme.ts).

### The messenger in your own screen

To put the chat in a navigation route, a tab or a bottom sheet instead of a modal, turn the modal off and render
`<VurpMessenger />` yourself:

```tsx
<VurpProvider presentation="none" … />

function SupportScreen({ navigation }) {
  return <VurpMessenger onClose={() => navigation.goBack()} keyboardVerticalOffset={headerHeight} />;
}
```

With `presentation="none"`, `open()` and notification taps set `visible` to `true`. Watch it to navigate to your
screen:

```tsx
const visible = useVurpState((s) => s.visible);
useEffect(() => { if (visible) navigation.navigate("Support"); }, [visible]);
```

### Your own UI

`useVurpState()` gives you everything the messenger shows, and `useVurp()` the actions: `startConversation`, `send`,
`openConversation`, `goHome`, `addFiles`, `retry`, `loadFaqs`, and more. `useVurpTheme()` returns the resolved
colours, so custom pieces can match. `client.on(event => …)` reports new messages and unread changes, for in-app
banners.

## Options

| Prop | |
|---|---|
| `projectId` | Your website's project ID (`proj_…`). Required. |
| `appId` | Bundle ID / package name as added in Vurp: a string, or `{ ios, android }`. Required. |
| `identity` | `{ userId, email?, userHash }` for the signed-in user, or `null`. |
| `pushToken` | `{ provider: "fcm" \| "apns", token }`, or `null`. |
| `pickFiles` | Enables attachments; see above. |
| `theme`, `colorScheme`, `strings` | Customising; see above. |
| `presentation` | `"modal"` (default) or `"none"`. |
| `insets` | Safe-area insets for the modal. Worked out for you when `react-native-safe-area-context` is installed. |
| `storage` | `{ getItem, setItem, removeItem }`, all async. Defaults to AsyncStorage. |
| `onEvent` | New messages, unread changes, open and close. |
| `apiUrl` | Only for a self-hosted or local Vurp server. |

## Troubleshooting

The SDK logs problems to the console with a `[Vurp]` prefix, and `useVurpState((s) => s.error)` holds the latest one.

- **"… isn't on this website's apps"**: add the exact bundle ID or package name under **Websites → Apps**, and check
  `appId` matches it.
- **"Chat is paused in this app"**: the business's plan allows fewer mobile apps than it has.
- **No push notifications**: check the credentials under **Apps → Push**. iOS development builds from Xcode need the
  APNs key set to **sandbox**; App Store and TestFlight builds need **production**. Notifications only go out when the
  person isn't in the chat.
- **Jest can't parse the package**: add `@usevurp` to `transformIgnorePatterns`, as for other React Native libraries.

## Example app

[`example/`](example) is an Expo app with everything above wired up. Copy `example/.env.example` to `example/.env`, add
your project ID, add `com.usevurp.example` as an app in Vurp, then:

```sh
cd example && npm install && npx expo start          # chat, in Expo Go
cd example && npx expo run:ios                        # or run:android, for push notifications
```
