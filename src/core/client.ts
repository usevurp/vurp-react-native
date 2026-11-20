import { io } from "socket.io-client";
import { apiRequest, VurpApiError, type ApiTarget } from "./api";
import {
  contentTypeOf,
  defaultFileTransport,
  fileProblem,
  kindOf,
  type FileTransport,
  type UploadTarget,
} from "./files";
import { parseNotification } from "./notifications";
import { safe, type VurpStorage } from "./storage";
import type {
  Attachment,
  Availability,
  AttachmentLimits,
  Conversation,
  Faqs,
  Identity,
  Message,
  PendingFile,
  PickedFile,
  Profile,
  PushProvider,
  VurpState,
  WidgetConfig,
} from "./types";

export const DEFAULT_API_URL = "https://api.usevurp.com";

/** The parts of a socket.io client the SDK uses. Replaced in tests. */
export type SocketLike = {
  on: (event: string, listener: (...args: never[]) => void) => unknown;
  emit: (event: string, ...args: unknown[]) => unknown;
  disconnect: () => unknown;
};

export type VurpClientOptions = {
  /** The website's project ID (proj_…), from Vurp → Websites → Install. */
  projectId: string;
  /** This app's bundle ID (iOS) or package name (Android), as added under Websites → Apps. */
  appId: string;
  platform: "ios" | "android";
  apiUrl?: string;
  /** The real-time gateway; the API serves it unless you were told otherwise. */
  gatewayUrl?: string;
  storage: VurpStorage;
  /** Testing seams. */
  fetch?: typeof fetch;
  createSocket?: (url: string, token: string) => SocketLike;
  files?: FileTransport;
};

type ServerMessage = Omit<Message, "state">;
type Outgoing = { attachmentIds: string[] };
type Listener = () => void;
export type VurpEvent =
  | { type: "message"; message: Message }
  | { type: "unread"; count: number }
  | { type: "open" }
  | { type: "close" };

const newClientId = () =>
  typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const sent = (m: ServerMessage): Message => ({ ...m, attachments: m.attachments ?? [], state: "sent" });
const NO_ATTACHMENTS: AttachmentLimits = {
  enabled: false,
  maxImageBytes: null,
  maxVideoBytes: null,
  perMessage: null,
};

/** Adds or replaces a message, matching on server ID or the sender's clientId; keeps time order. */
function upsert(list: Message[], message: Message) {
  const index = list.findIndex(
    (m) =>
      (message.id && m.id === message.id) ||
      (m.clientId === message.clientId && m.senderType === message.senderType),
  );
  const next =
    index === -1 ? [...list, message] : list.map((m, i) => (i === index ? { ...m, ...message } : m));
  // Server IDs are UUIDv7, so they sort by time; unsent messages stay where they are, at the end.
  return next.sort((a, b) => (a.id && b.id ? a.id.localeCompare(b.id) : 0));
}

const unreadOf = (conversations: Conversation[]) => conversations.reduce((sum, c) => sum + c.unread, 0);

/**
 * The visitor's side of Vurp chat, without any UI: session, socket, conversations and messages.
 * The built-in messenger renders this state; useVurpState() gives it to your own UI.
 *
 * Sessions start lazily: nothing is created on Vurp until the visitor opens the chat (or a stored
 * session from an earlier launch is resumed). Sends go over HTTP and are safe to retry; the socket
 * only receives, and every reconnect catches up on anything missed.
 */
export class VurpClient {
  state: VurpState;
  private readonly storage: VurpStorage;
  private readonly api: ApiTarget;
  private readonly files: FileTransport;
  private token: string | null = null;
  private identity: Identity | null = null;
  private socket: SocketLike | null = null;
  private foreground = true;
  private ready: Promise<boolean> | null = null;
  private pushToken: { provider: PushProvider; token: string } | null = null;
  private pushSentFor: string | null = null;
  private outgoing = new Map<string, Outgoing>();
  private reloadedAt = new Map<string, number>();
  private listeners = new Set<Listener>();
  private eventListeners = new Set<(event: VurpEvent) => void>();
  private faqs: Promise<Faqs> | null = null;
  private loaded: Promise<void>;

  constructor(private readonly options: VurpClientOptions) {
    this.storage = safe(options.storage);
    this.api = {
      apiUrl: options.apiUrl ?? DEFAULT_API_URL,
      platform: options.platform,
      appId: options.appId,
      fetch: options.fetch,
    };
    this.files = options.files ?? defaultFileTransport;
    this.state = {
      phase: "idle",
      error: null,
      config: null,
      visible: false,
      availability: "online",
      conversations: [],
      current: null,
      messages: {},
      starting: null,
      startError: null,
      profile: { email: "", name: "" },
      verified: false,
      attachmentLimits: NO_ATTACHMENTS,
      files: [],
      fileError: null,
      unread: 0,
    };
    this.loaded = this.restore();
  }

  private key(name: string) {
    return `vurp.${this.options.projectId}.${name}`;
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  /** Calls `listener` after every state change. Returns an unsubscribe function. */
  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** New messages, unread changes and open/close, for your own badges and in-app banners. */
  on(listener: (event: VurpEvent) => void) {
    this.eventListeners.add(listener);
    return () => void this.eventListeners.delete(listener);
  }

  private emit(event: VurpEvent) {
    this.eventListeners.forEach((l) => l(event));
  }

  private set(patch: Partial<VurpState>) {
    const before = this.state.unread;
    this.state = { ...this.state, ...patch };
    if (patch.conversations) this.state.unread = unreadOf(this.state.conversations);
    this.listeners.forEach((l) => l());
    if (this.state.unread !== before) this.emit({ type: "unread", count: this.state.unread });
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /** Reads what an earlier launch stored, and resumes its session if there was one. */
  private async restore() {
    const [token, profile, config, push] = await Promise.all([
      this.storage.getItem(this.key("token")),
      this.storage.getItem(this.key("profile")),
      this.storage.getItem(this.key("config")),
      this.storage.getItem(this.key("push")),
    ]);
    this.token = token;
    const parse = <T>(value: string | null) => {
      try {
        return value ? (JSON.parse(value) as T) : null;
      } catch {
        return null;
      }
    };
    // Something set while this was loading wins.
    this.pushToken ??= parse(push);
    this.set({
      profile: parse<Profile>(profile) ?? this.state.profile,
      config: this.state.config ?? parse<WidgetConfig>(config),
    });
  }

  /** Starts the client: resumes a stored session so unread replies and live updates work. */
  async start() {
    await this.loaded;
    if (this.token) await this.ensureReady();
  }

  /**
   * Loads settings, starts or resumes the session and connects. Safe to call often: it runs once,
   * and again only after a failure.
   */
  ensureReady(): Promise<boolean> {
    if (!this.ready) {
      this.ready = this.connectAll().then((ok) => {
        if (!ok) this.ready = null;
        return ok;
      });
    }
    return this.ready;
  }

  private async connectAll() {
    await this.loaded;
    if (this.state.phase !== "ready") this.set({ phase: "loading", error: null });
    try {
      const config = await apiRequest<WidgetConfig>(
        this.api,
        `/projects/${encodeURIComponent(this.options.projectId)}`,
      );
      this.set({ config });
      void this.storage.setItem(this.key("config"), JSON.stringify(config));
      await this.renewSession();
      await this.refresh();
      this.set({ phase: "ready" });
      return true;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.warn(`[Vurp] ${error}`);
      this.set({ phase: "unavailable", error });
      return false;
    }
  }

  /** Starts or resumes the visitor session, with the identify() payload if any. */
  private async renewSession() {
    const session = await apiRequest<{ token: string; verified: boolean; identityError?: string }>(
      this.api,
      `/projects/${encodeURIComponent(this.options.projectId)}/sessions`,
      { body: { token: this.token ?? undefined, identity: this.identity ?? undefined } },
    );
    if (session.identityError) console.warn(`[Vurp] identify(): ${session.identityError}`);
    const changed = session.token !== this.token;
    this.token = session.token;
    void this.storage.setItem(this.key("token"), session.token);
    this.set({ verified: session.verified });
    if (changed || !this.socket) this.connect();
    if (changed) this.pushSentFor = null;
    await this.sendPushToken();
    return changed;
  }

  private connect() {
    this.socket?.disconnect();
    this.socket = null;
    if (!this.token || !this.foreground) return;
    const url = `${(this.options.gatewayUrl ?? this.api.apiUrl).replace(/\/$/, "")}/widget`;
    const socket = this.options.createSocket
      ? this.options.createSocket(url, this.token)
      : (io(url, { auth: { token: this.token }, transports: ["websocket"] }) as unknown as SocketLike);
    this.socket = socket;
    let connectedBefore = false;
    socket.on("connect", () => {
      // The first connect follows a fresh load; later ones are reconnects that may have missed messages.
      if (connectedBefore) void this.catchUp();
      connectedBefore = true;
    });
    socket.on("connect_error", ((err: Error) => {
      if (err.message === "visitor_session_required") void this.recover();
    }) as never);
    socket.on("message.created", ((message: ServerMessage) => this.received(sent(message))) as never);
    socket.on("conversation.updated", ((conversation: Conversation) =>
      this.upsertConversation(conversation)) as never);
  }

  /** The stored session ended (expired, revoked, app removed): start again. */
  private async recover() {
    this.token = null;
    await this.storage.removeItem(this.key("token"));
    this.ready = null;
    if (this.state.phase === "ready") await this.ensureReady();
  }

  /**
   * Tell the client when the app goes to the background and back (VurpProvider does this for you).
   * The socket closes in the background, so Vurp knows to send push notifications instead.
   */
  setForeground(active: boolean) {
    if (active === this.foreground) return;
    this.foreground = active;
    if (!active) {
      this.socket?.disconnect();
      this.socket = null;
    } else if (this.token && this.state.phase === "ready") {
      this.connect();
      void this.catchUp();
    }
  }

  /** Stops everything. The client can't be used afterwards. */
  destroy() {
    this.socket?.disconnect();
    this.socket = null;
    this.listeners.clear();
    this.eventListeners.clear();
  }

  // ─── Identity and push ─────────────────────────────────────────────────────

  /**
   * Who your signed-in user is, so they see their history on every device and their website
   * conversations too. Pass null when nobody is signed in. Needs identity verification on the
   * business's plan; see the README for computing userHash on your server.
   */
  async identify(identity: Identity | null) {
    const same = identity?.userId === this.identity?.userId && identity?.userHash === this.identity?.userHash;
    this.identity = identity;
    if (identity?.email && !this.state.profile.email) {
      this.set({ profile: { ...this.state.profile, email: identity.email } });
    }
    if (same || !this.token || this.state.phase !== "ready") return;
    try {
      if (await this.renewSession()) {
        // A different person may now see different conversations.
        this.clearFiles();
        this.set({ messages: {}, current: null, starting: null });
        await this.refresh();
      }
    } catch (err) {
      console.warn(`[Vurp] identify(): ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Your user signed out: ends their Vurp session so the next person on this device starts fresh
   * and doesn't get their notifications. The push token is kept for the next session.
   */
  async logout() {
    const token = this.token;
    this.identity = null;
    this.token = null;
    this.ready = null;
    this.pushSentFor = null;
    this.socket?.disconnect();
    this.socket = null;
    this.clearFiles();
    await Promise.all([
      this.storage.removeItem(this.key("token")),
      this.storage.removeItem(this.key("profile")),
    ]);
    this.set({
      phase: "idle",
      visible: false,
      conversations: [],
      messages: {},
      current: null,
      starting: null,
      startError: null,
      verified: false,
      profile: { email: "", name: "" },
    });
    if (token) {
      await apiRequest(this.api, "/session", { method: "DELETE", token }).catch(() => {});
    }
  }

  /**
   * The device's push token, so replies reach the visitor when the app isn't open. Use "fcm" with a
   * Firebase Messaging token (Android, or iOS with Firebase), "apns" with a raw APNs device token.
   * Call it at every launch with the current token; it's sent when a chat session exists.
   */
  async setPushToken(push: { provider: PushProvider; token: string } | null) {
    this.pushToken = push;
    this.pushSentFor = null;
    await this.storage.setItem(this.key("push"), JSON.stringify(push));
    if (!push && this.token) {
      await apiRequest(this.api, "/session/push", { method: "DELETE", token: this.token }).catch(() => {});
      return;
    }
    await this.sendPushToken();
  }

  private async sendPushToken() {
    const push = this.pushToken;
    if (!push || !this.token) return;
    const key = `${this.token}:${push.provider}:${push.token}`;
    if (this.pushSentFor === key) return;
    try {
      await apiRequest(this.api, "/session/push", { method: "PUT", body: push, token: this.token });
      this.pushSentFor = key;
    } catch (err) {
      console.warn(`[Vurp] Couldn't register the push token: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Whether a notification's data is a Vurp reply for this project. Use it to keep Vurp's
   * notifications apart from your own.
   */
  isVurpNotification(data: unknown) {
    return parseNotification(data)?.projectId === this.options.projectId;
  }

  /**
   * Opens the conversation a tapped notification is about. Returns false (and does nothing) if
   * it isn't a Vurp notification for this project.
   */
  handleNotification(data: unknown) {
    const parsed = parseNotification(data);
    if (!parsed || parsed.projectId !== this.options.projectId) return false;
    void this.open(parsed.conversationId);
    return true;
  }

  // ─── Built-in messenger ────────────────────────────────────────────────────

  /** Shows the built-in messenger, at a conversation if given. */
  async open(conversationId?: string) {
    if (!this.state.visible) {
      this.set({ visible: true });
      this.emit({ type: "open" });
    }
    if (!(await this.ensureReady())) return;
    if (conversationId) await this.openConversation(conversationId);
    else if (this.state.current) this.markRead(this.state.current);
  }

  close() {
    if (!this.state.visible) return;
    this.set({ visible: false });
    this.emit({ type: "close" });
  }

  // ─── Data ──────────────────────────────────────────────────────────────────

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
    retried = false,
  ): Promise<T> {
    try {
      return await apiRequest<T>(this.api, path, { ...init, token: this.token });
    } catch (err) {
      if (err instanceof VurpApiError && err.status === 401 && !retried) {
        await this.renewExpired(this.token);
        return this.request(path, init, true);
      }
      throw err;
    }
  }

  /**
   * The session behind `expired` stopped working. Requests in flight together all see the 401;
   * only the first starts a new session, and the rest wait for it.
   */
  private renewing: Promise<unknown> | null = null;
  private async renewExpired(expired: string | null) {
    if (this.renewing) return void (await this.renewing);
    if (this.token !== expired) return; // Already renewed.
    this.renewing = (async () => {
      this.token = null;
      await this.storage.removeItem(this.key("token"));
      await this.renewSession();
    })().finally(() => (this.renewing = null));
    await this.renewing;
  }

  /** Reloads availability and the conversation list. */
  async refresh() {
    const [status, conversations] = await Promise.all([
      this.request<{ availability: Availability; attachments: AttachmentLimits }>("/status").catch(
        () => null,
      ),
      this.request<Conversation[]>("/conversations").catch(() => null),
    ]);
    this.set({
      availability: status?.availability ?? this.state.availability,
      attachmentLimits: status?.attachments ?? this.state.attachmentLimits,
      conversations: conversations ?? this.state.conversations,
    });
  }

  /** After a reconnect: fetch what was missed in loaded conversations, and the latest list. */
  private async catchUp() {
    await this.refresh();
    for (const [id, list] of Object.entries(this.state.messages)) {
      const lastId = [...list].reverse().find((m) => m.id)?.id;
      const missed = await this.request<ServerMessage[]>(
        `/conversations/${id}/messages${lastId ? `?after=${lastId}` : ""}`,
      ).catch(() => []);
      missed.forEach((m) => this.received(sent(m), true));
    }
  }

  /** Published FAQs, loaded once per launch. */
  loadFaqs(): Promise<Faqs> {
    this.faqs ??= apiRequest<Faqs>(
      this.api,
      `/projects/${encodeURIComponent(this.options.projectId)}/faqs`,
    ).catch((err) => {
      this.faqs = null;
      throw err;
    });
    return this.faqs;
  }

  private upsertConversation(conversation: Conversation) {
    const exists = this.state.conversations.some((c) => c.id === conversation.id);
    const conversations = exists
      ? this.state.conversations.map((c) => (c.id === conversation.id ? { ...c, ...conversation } : c))
      : [conversation, ...this.state.conversations];
    this.set({ conversations });
  }

  async openConversation(id: string) {
    this.set({ current: id, startError: null });
    await this.loadMessages(id);
  }

  /** Back to the start screen. */
  goHome() {
    this.set({ current: null, startError: null });
    void this.refresh();
  }

  /** Download links last 15 minutes; a file that stops loading asks for fresh ones (at most once a minute). */
  linkExpired(conversationId: string) {
    const last = this.reloadedAt.get(conversationId) ?? 0;
    if (Date.now() - last < 60_000) return;
    this.reloadedAt.set(conversationId, Date.now());
    void this.loadMessages(conversationId);
  }

  private async loadMessages(id: string) {
    const messages = await this.request<ServerMessage[]>(`/conversations/${id}/messages`).catch(() => null);
    if (!messages) return;
    // Keep any unsent visitor messages from before.
    const pending = (this.state.messages[id] ?? []).filter((m) => m.state !== "sent");
    this.set({ messages: { ...this.state.messages, [id]: [...messages.map(sent), ...pending] } });
    this.markRead(id);
  }

  setProfile(profile: Profile) {
    void this.storage.setItem(this.key("profile"), JSON.stringify(profile));
    this.set({ profile });
  }

  /** Starts a conversation with its first message. The email is required by Vurp. */
  async startConversation(body: string, profile: Profile = this.state.profile) {
    this.setProfile(profile);
    const message = this.newMessage("", body);
    this.set({ starting: message, startError: null });
    await this.sendStart(message);
  }

  async retryStart() {
    if (this.state.starting) await this.sendStart({ ...this.state.starting, state: "sending" });
  }

  private newMessage(conversationId: string, body: string): Message {
    const ready = this.state.files.filter((f) => f.state === "ready" && f.id);
    // Failed files stay, so the visitor sees they didn't go.
    this.set({ files: this.state.files.filter((f) => !ready.includes(f)), fileError: null });
    const message: Message = {
      conversationId,
      clientId: newClientId(),
      senderType: "visitor",
      senderName: null,
      body,
      attachments: ready.map((f): Attachment => ({
        id: f.id!,
        kind: f.kind,
        contentType: "",
        fileName: f.name,
        size: 0,
        url: f.uri,
      })),
      createdAt: new Date().toISOString(),
      state: "sending",
    };
    this.outgoing.set(message.clientId, { attachmentIds: ready.map((f) => f.id!) });
    return message;
  }

  private async sendStart(message: Message) {
    this.set({ starting: message });
    try {
      const result = await this.request<{ conversation: Conversation; messages: ServerMessage[] }>(
        "/conversations",
        {
          body: {
            email: this.state.profile.email,
            name: this.state.profile.name || undefined,
            message: this.payload(message),
          },
        },
      );
      this.outgoing.delete(message.clientId);
      this.upsertConversation(result.conversation);
      this.set({
        starting: null,
        current: result.conversation.id,
        messages: { ...this.state.messages, [result.conversation.id]: result.messages.map(sent) },
      });
      // A verified visitor may now have a customer room to join.
      this.socket?.emit("resync");
    } catch (err) {
      this.set({
        starting: { ...message, state: "failed" },
        startError:
          err instanceof VurpApiError && err.status === 400
            ? "Check your email address and try again."
            : err instanceof VurpApiError && err.status < 500
              ? err.message
              : null,
      });
    }
  }

  /** Sends a message, with the composer's ready files, in the conversation on screen. */
  async send(body: string) {
    const id = this.state.current;
    if (!id) return;
    await this.deliver(this.newMessage(id, body));
  }

  /** Safe to retry: the same clientId is stored once. */
  private async deliver(message: Message) {
    const id = message.conversationId;
    this.putMessage(message);
    try {
      const saved = await this.request<ServerMessage>(`/conversations/${id}/messages`, {
        body: this.payload(message),
      });
      this.outgoing.delete(message.clientId);
      this.putMessage(sent(saved));
    } catch (err) {
      this.putMessage({ ...message, state: "failed" });
      const conversation = this.state.conversations.find((c) => c.id === id);
      if (err instanceof VurpApiError && err.code === "conversation_closed" && conversation) {
        this.upsertConversation({ ...conversation, status: "closed" });
      }
    }
  }

  async retry(message: Message) {
    await this.deliver({ ...message, state: "sending" });
  }

  private payload(message: Message) {
    return {
      clientId: message.clientId,
      body: message.body,
      attachmentIds: this.outgoing.get(message.clientId)?.attachmentIds ?? [],
    };
  }

  private putMessage(message: Message) {
    const list = this.state.messages[message.conversationId] ?? [];
    this.set({ messages: { ...this.state.messages, [message.conversationId]: upsert(list, message) } });
  }

  private received(message: Message, quiet = false) {
    const id = message.conversationId;
    const known = this.state.messages[id]?.some(
      (m) =>
        (message.id && m.id === message.id) ||
        (m.clientId === message.clientId && m.senderType === message.senderType),
    );
    // Only conversations the visitor has loaded keep a message list; others just update their summary.
    if (this.state.messages[id]) this.putMessage(message);
    if (!this.state.conversations.some((c) => c.id === id)) void this.refresh();
    if ((message.senderType === "agent" || message.senderType === "ai") && !known && !quiet) {
      if (this.state.visible && this.state.current === id) this.markRead(id);
      this.emit({ type: "message", message });
    }
  }

  private markRead(id: string) {
    const conversation = this.state.conversations.find((c) => c.id === id);
    if (conversation?.unread) this.upsertConversation({ ...conversation, unread: 0 });
    void this.request(`/conversations/${id}/read`, { method: "POST" }).catch(() => {});
  }

  // ─── Files ─────────────────────────────────────────────────────────────────

  /**
   * Adds picked photos or videos to the composer and uploads them, within the plan's limits.
   * The built-in messenger calls this with what your `pickFiles` returns.
   */
  addFiles(list: PickedFile[]) {
    const limits = this.state.attachmentLimits;
    if (!limits.enabled) {
      this.set({ fileError: "Files can't be sent in this chat." });
      return;
    }
    const room = limits.perMessage === null ? Infinity : limits.perMessage - this.state.files.length;
    let fileError: string | null = null;
    const accepted: PickedFile[] = [];
    for (const file of list) {
      const problem = fileProblem(file, file.size, limits);
      if (problem) fileError = problem;
      else if (accepted.length >= room) {
        fileError =
          limits.perMessage === 1
            ? "You can send one file per message."
            : `You can send up to ${limits.perMessage} files per message.`;
      } else accepted.push(file);
    }
    this.set({ fileError });
    for (const file of accepted) void this.upload(file);
  }

  removeFile(localId: string) {
    const file = this.state.files.find((f) => f.localId === localId);
    if (!file) return;
    if (file.id) void this.request(`/attachments/${file.id}`, { method: "DELETE" }).catch(() => {});
    this.set({ files: this.state.files.filter((f) => f.localId !== localId), fileError: null });
  }

  private patchFile(localId: string, patch: Partial<PendingFile>) {
    this.set({ files: this.state.files.map((f) => (f.localId === localId ? { ...f, ...patch } : f)) });
  }

  private async upload(file: PickedFile) {
    const contentType = contentTypeOf(file)!;
    const pending: PendingFile = {
      localId: newClientId(),
      name: file.name,
      kind: kindOf(contentType),
      uri: file.uri,
      progress: 0,
      state: "uploading",
      id: null,
      error: null,
    };
    this.set({ files: [...this.state.files, pending] });
    try {
      const blob = await this.files.read(file);
      // Pickers don't always know the size; now it's known.
      const problem = fileProblem(file, blob.size, this.state.attachmentLimits);
      if (problem) throw new VurpApiError(413, "file_too_large", problem);
      const { attachment, upload } = await this.request<{ attachment: Attachment; upload: UploadTarget }>(
        "/attachments",
        { body: { fileName: file.name, contentType, size: blob.size, head: await this.files.head(blob) } },
      );
      this.patchFile(pending.localId, { id: attachment.id });
      let shown = 0;
      await this.files.put(upload, blob, (fraction) => {
        // Re-render every 5% or so, not on every progress event.
        if (fraction - shown >= 0.05) this.patchFile(pending.localId, { progress: (shown = fraction) });
      });
      await this.request(`/attachments/${attachment.id}/verify`, { method: "POST" });
      this.patchFile(pending.localId, { state: "ready", progress: 1 });
    } catch (err) {
      this.patchFile(pending.localId, {
        state: "failed",
        error:
          err instanceof VurpApiError && err.status < 500
            ? err.message
            : "Upload failed. Remove it and try again.",
      });
    }
  }

  private clearFiles() {
    this.set({ files: [], fileError: null });
  }
}
