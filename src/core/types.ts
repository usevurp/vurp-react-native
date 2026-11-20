// Shapes of the Vurp widget API (vurp-server src/modules/widget), shared with the web widget.

/** The business's chat settings from the Vurp dashboard (Websites → Appearance). */
export type WidgetConfig = {
  position: "bottom_right" | "bottom_left" | "top_right" | "top_left";
  brandColor: string;
  launcherIcon: "chat" | "help" | "headset";
  theme: "light" | "dark";
  title: string;
  welcomeText: string;
  greetingText: string;
  introPrompts: string[];
  onlineText: string;
  busyText: string;
  offlineText: string;
  /** International format (+2348031234567); null when the business hasn't added one. */
  whatsappNumber: string | null;
  showBranding: boolean;
  /** Whether the business emails visitors who leave before a reply. */
  emailReplies: boolean;
};

/**
 * Who your signed-in user is. `userHash` is HMAC-SHA256(identity secret, userId) in hex, computed
 * on your server: never ship the identity secret in your app.
 */
export type Identity = { userId: string; email?: string; userHash: string };

export type Availability = "online" | "busy" | "offline";

export type Conversation = {
  id: string;
  status: "open" | "pending" | "closed";
  mode: "live" | "message";
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unread: number;
  /** Clyde, the business's AI assistant, is answering. Off once the team takes over. */
  assistantActive?: boolean;
  closedAt: string | null;
  createdAt: string;
};

/** A file as the server describes it, with a download link that lasts 15 minutes. */
export type Attachment = {
  id: string;
  kind: "image" | "video";
  contentType: string;
  fileName: string;
  size: number;
  /** Removed after the business's retention period; only the name is left. */
  expired?: boolean;
  url: string | null;
};

export type Message = {
  id?: string;
  conversationId: string;
  clientId: string;
  senderType: "visitor" | "agent" | "system" | "ai";
  senderName: string | null;
  body: string;
  attachments: Attachment[];
  createdAt: string;
  /** Visitor messages go sending → sent, or failed (and can be retried). */
  state: "sending" | "sent" | "failed";
};

export type AttachmentLimits = {
  enabled: boolean;
  maxImageBytes: number | null;
  maxVideoBytes: number | null;
  perMessage: number | null;
};

/**
 * A photo or video to send, as returned by a picker (expo-image-picker, react-native-image-picker,
 * expo-document-picker…). `uri` must be readable with fetch (file://, content://, ph://).
 */
export type PickedFile = { uri: string; name: string; type: string; size?: number };

/** A file in the composer: uploading, then ready to go with the next message. */
export type PendingFile = {
  localId: string;
  name: string;
  kind: "image" | "video";
  /** The local file, for a preview while it uploads. */
  uri: string;
  progress: number;
  state: "uploading" | "ready" | "failed";
  /** The server's ID once uploaded and checked. */
  id: string | null;
  error: string | null;
};

export type Faq = { id: string; question: string; answerHtml: string; categoryId: string | null };
export type FaqCategory = { id: string; name: string };
export type Faqs = { categories: FaqCategory[]; faqs: Faq[] };

/** The visitor's name and email, remembered so they don't retype them for the next conversation. */
export type Profile = { email: string; name: string };

/** Everything the messenger shows. Read it with useVurpState() to build your own UI. */
export type VurpState = {
  /**
   * idle: nothing loaded yet (chat not opened, no stored session). loading → ready, or
   * unavailable (the app isn't allowed, the widget is off, or Vurp can't be reached).
   */
  phase: "idle" | "loading" | "ready" | "unavailable";
  /** Why chat is unavailable, for logs. Not meant for end users. */
  error: string | null;
  config: WidgetConfig | null;
  /** Whether the built-in messenger is on screen (open() / close()). */
  visible: boolean;
  availability: Availability;
  conversations: Conversation[];
  /** The conversation on screen; null shows the start screen. */
  current: string | null;
  messages: Record<string, Message[]>;
  /** The first message while its conversation is being created. */
  starting: Message | null;
  startError: string | null;
  profile: Profile;
  verified: boolean;
  attachmentLimits: AttachmentLimits;
  files: PendingFile[];
  fileError: string | null;
  /** Agent and AI messages the visitor hasn't read, across conversations. */
  unread: number;
};

export type PushProvider = "fcm" | "apns";
