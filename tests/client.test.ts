import { beforeEach, describe, expect, it, vi } from "vitest";
import { VurpClient, type SocketLike } from "../src/core/client";
import type { FileTransport } from "../src/core/files";
import { memoryStorage, type VurpStorage } from "../src/core/storage";
import type { Conversation, WidgetConfig } from "../src/core/types";

const PROJECT = "proj_test";
const CONFIG = {
  title: "Chat with us",
  brandColor: "#635BFF",
  theme: "light",
  introPrompts: [],
} as unknown as WidgetConfig;

type Call = { method: string; path: string; headers: Record<string, string>; body: unknown };

/** A small stand-in for the Vurp widget API. */
function fakeApi() {
  const calls: Call[] = [];
  let tokens = 0;
  const live = new Set<string>();
  const conversations: Conversation[] = [];
  const messages: Record<string, unknown[]> = {};
  const overrides = new Map<string, (call: Call) => { status: number; body?: unknown } | undefined>();

  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace("https://api.test/widget/v1", "");
    const call: Call = {
      method: init.method ?? "GET",
      path,
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    const reply = (status: number, body?: unknown) =>
      ({ status, ok: status < 300, json: async () => body }) as Response;
    const token = call.headers.Authorization?.replace("Bearer ", "");

    const override = overrides.get(`${call.method} ${path.split("?")[0]}`)?.(call);
    if (override) return reply(override.status, override.body);

    if (path === `/projects/${PROJECT}`) return reply(200, CONFIG);
    if (path === `/projects/${PROJECT}/sessions`) {
      const body = call.body as { token?: string; identity?: { userId: string } };
      // Resumes a live token unless someone else is identified on it.
      const resumed = body.token && live.has(body.token) && !body.identity?.userId.startsWith("other");
      const next = resumed ? body.token! : `vt_${++tokens}`;
      live.add(next);
      return reply(200, { token: next, verified: !!body.identity });
    }
    if (token && !live.has(token)) return reply(401, { error: { code: "visitor_session_required" } });
    if (path === "/status")
      return reply(200, {
        availability: "online",
        attachments: { enabled: true, maxImageBytes: 1000, maxVideoBytes: null, perMessage: 2 },
      });
    if (path === "/conversations" && call.method === "GET") return reply(200, conversations);
    if (path === "/session" && call.method === "DELETE") {
      live.delete(token!);
      return reply(204);
    }
    if (path === "/session/push") return reply(204);
    const m = /^\/conversations\/([^/?]+)\/messages/.exec(path);
    if (m && call.method === "GET") return reply(200, messages[m[1]!] ?? []);
    if (m && call.method === "POST") {
      const body = call.body as { clientId: string; body: string };
      return reply(201, {
        id: `m-${body.clientId}`,
        conversationId: m[1],
        clientId: body.clientId,
        senderType: "visitor",
        senderName: null,
        body: body.body,
        attachments: [],
        createdAt: new Date().toISOString(),
      });
    }
    if (/\/read$/.test(path)) return reply(204);
    return reply(404, { error: { code: "not_found", message: `No route ${call.method} ${path}` } });
  });

  return {
    fetch: fetch as unknown as typeof globalThis.fetch,
    calls,
    conversations,
    messages,
    override: (route: string, fn: (call: Call) => { status: number; body?: unknown } | undefined) =>
      overrides.set(route, fn),
    expire: (token: string) => live.delete(token),
    to: (path: string, method = "GET") => calls.filter((c) => c.path === path && c.method === method),
  };
}

/** A socket that records what happened and lets the test deliver events. */
function fakeSockets() {
  const sockets: { token: string; handlers: Map<string, (...args: unknown[]) => void>; closed: boolean }[] =
    [];
  const create = (_url: string, token: string): SocketLike => {
    const entry = { token, handlers: new Map<string, (...args: unknown[]) => void>(), closed: false };
    sockets.push(entry);
    return {
      on: (event, listener) => entry.handlers.set(event, listener as (...args: unknown[]) => void),
      emit: () => {},
      disconnect: () => {
        entry.closed = true;
      },
    };
  };
  const open = () => sockets.filter((s) => !s.closed);
  const deliver = (event: string, payload: unknown) =>
    open().forEach((s) => s.handlers.get(event)?.(payload));
  return { sockets, create, open, deliver };
}

const conversation = (id: string, unread = 0): Conversation => ({
  id,
  status: "open",
  mode: "live",
  lastMessageAt: null,
  lastMessagePreview: null,
  unread,
  closedAt: null,
  createdAt: new Date().toISOString(),
});

let api: ReturnType<typeof fakeApi>;
let sockets: ReturnType<typeof fakeSockets>;
let storage: VurpStorage;

const makeClient = (files?: FileTransport) =>
  new VurpClient({
    projectId: PROJECT,
    appId: "com.acme.shop",
    platform: "ios",
    apiUrl: "https://api.test",
    storage,
    fetch: api.fetch,
    createSocket: sockets.create,
    files,
  });

beforeEach(() => {
  api = fakeApi();
  sockets = fakeSockets();
  storage = memoryStorage();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("starting", () => {
  it("does nothing on Vurp until the chat is opened, when there's no earlier session", async () => {
    const client = makeClient();
    await client.start();
    expect(client.state.phase).toBe("idle");
    expect(api.calls).toHaveLength(0);
  });

  it("names the app instead of sending an Origin, and stores the session on open", async () => {
    const client = makeClient();
    await client.open();
    expect(client.state).toMatchObject({ phase: "ready", visible: true, config: CONFIG });
    const [first] = api.calls;
    expect(first!.headers).toMatchObject({ "X-Vurp-Platform": "ios", "X-Vurp-App-Id": "com.acme.shop" });
    expect(first!.headers).not.toHaveProperty("Origin");
    expect(await storage.getItem(`vurp.${PROJECT}.token`)).toBe("vt_1");
    expect(sockets.open().map((s) => s.token)).toEqual(["vt_1"]);
  });

  it("resumes the stored session at the next launch, without creating a new one", async () => {
    await makeClient().open();
    const next = makeClient();
    await next.start();
    expect(next.state.phase).toBe("ready");
    const sessions = api.to(`/projects/${PROJECT}/sessions`, "POST");
    expect(sessions.at(-1)!.body).toMatchObject({ token: "vt_1" });
    expect(await storage.getItem(`vurp.${PROJECT}.token`)).toBe("vt_1");
  });

  it("reports why chat is unavailable, and tries again on the next open", async () => {
    let refuse = true;
    api.override(`GET /projects/${PROJECT}`, () =>
      refuse
        ? { status: 403, body: { error: { code: "app_not_allowed", message: "Not allowed" } } }
        : undefined,
    );
    const client = makeClient();
    await client.open();
    expect(client.state).toMatchObject({ phase: "unavailable", error: "Not allowed" });
    refuse = false;
    await client.open();
    expect(client.state.phase).toBe("ready");
  });

  it("starts a new session when the stored one has ended", async () => {
    const client = makeClient();
    await client.open();
    api.expire("vt_1");
    await client.refresh();
    expect(await storage.getItem(`vurp.${PROJECT}.token`)).toBe("vt_2");
  });
});

describe("push", () => {
  it("registers the token once a session exists, and only once", async () => {
    const client = makeClient();
    await client.start();
    await client.setPushToken({ provider: "apns", token: "a".repeat(64) });
    expect(api.to("/session/push", "PUT")).toHaveLength(0);

    await client.open();
    const puts = api.to("/session/push", "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0]!.body).toEqual({ provider: "apns", token: "a".repeat(64) });
    expect(puts[0]!.headers.Authorization).toBe("Bearer vt_1");
    await client.setPushToken({ provider: "apns", token: "a".repeat(64) });
    expect(api.to("/session/push", "PUT")).toHaveLength(2);
    await client.refresh();
    expect(api.to("/session/push", "PUT")).toHaveLength(2);
  });

  it("remembers the token across launches", async () => {
    const first = makeClient();
    await first.setPushToken({ provider: "fcm", token: "fcm-token-1234567" });
    const second = makeClient();
    await second.open();
    expect(api.to("/session/push", "PUT")[0]!.body).toEqual({ provider: "fcm", token: "fcm-token-1234567" });
  });

  it("opens the conversation a tapped notification is about, and ignores other notifications", async () => {
    api.conversations.push(conversation("c1", 1));
    const client = makeClient();
    expect(client.handleNotification({ vurp: "reply", conversationId: "c1", projectId: "proj_other" })).toBe(
      false,
    );
    expect(client.handleNotification({ type: "promo" })).toBe(false);
    expect(client.isVurpNotification({ vurp: "reply", conversationId: "c1", projectId: PROJECT })).toBe(true);

    expect(client.handleNotification({ vurp: "reply", conversationId: "c1", projectId: PROJECT })).toBe(true);
    await vi.waitFor(() => expect(client.state.current).toBe("c1"));
    expect(client.state.visible).toBe(true);
    await vi.waitFor(() => expect(api.to("/conversations/c1/read", "POST")).toHaveLength(1));
  });
});

describe("signing out", () => {
  it("ends the session on Vurp and forgets it on the device", async () => {
    const client = makeClient();
    await client.setPushToken({ provider: "apns", token: "a".repeat(64) });
    await client.open();
    client.setProfile({ email: "a@example.com", name: "A" });
    await client.logout();

    const ended = api.to("/session", "DELETE");
    expect(ended).toHaveLength(1);
    expect(ended[0]!.headers.Authorization).toBe("Bearer vt_1");
    expect(await storage.getItem(`vurp.${PROJECT}.token`)).toBeNull();
    expect(client.state).toMatchObject({ phase: "idle", visible: false, profile: { email: "", name: "" } });
    expect(sockets.open()).toHaveLength(0);

    // The next person gets a new session, and the device's push token moves to it.
    await client.open();
    expect(api.to("/session/push", "PUT").at(-1)!.headers.Authorization).toBe("Bearer vt_2");
  });

  it("starts fresh when a different user is identified", async () => {
    api.conversations.push(conversation("c1"));
    const client = makeClient();
    await client.identify({ userId: "u1", userHash: "x".repeat(64) });
    await client.open("c1");
    expect(Object.keys(client.state.messages)).toEqual(["c1"]);

    await client.identify({ userId: "other-user", userHash: "y".repeat(64) });
    expect(client.state.messages).toEqual({});
    expect(client.state.current).toBeNull();
    expect(sockets.open().map((s) => s.token)).toEqual(["vt_2"]);
  });
});

describe("background and foreground", () => {
  it("closes the socket in the background, so Vurp pushes instead, and catches up on return", async () => {
    const client = makeClient();
    await client.open();
    client.setForeground(false);
    expect(sockets.open()).toHaveLength(0);

    api.conversations.push(conversation("c1", 2));
    client.setForeground(true);
    expect(sockets.open()).toHaveLength(1);
    await vi.waitFor(() => expect(client.state.unread).toBe(2));
  });
});

describe("messages", () => {
  it("counts unread replies, and marks them read when they arrive on screen", async () => {
    api.conversations.push(conversation("c1"));
    const client = makeClient();
    const events: unknown[] = [];
    client.on((e) => events.push(e));
    await client.open("c1");

    sockets.deliver("conversation.updated", { ...conversation("c1"), unread: 1 });
    sockets.deliver("message.created", {
      id: "m1",
      conversationId: "c1",
      clientId: "x",
      senderType: "agent",
      senderName: "Ada",
      body: "Hi",
      attachments: [],
      createdAt: new Date().toISOString(),
    });
    expect(events).toContainEqual(expect.objectContaining({ type: "message" }));
    expect(api.to("/conversations/c1/read", "POST").length).toBeGreaterThanOrEqual(2);
    expect(client.state.messages.c1!.map((m) => m.body)).toEqual(["Hi"]);

    client.close();
    sockets.deliver("conversation.updated", { ...conversation("c1"), unread: 3 });
    expect(client.state.unread).toBe(3);
    expect(events).toContainEqual({ type: "unread", count: 3 });
  });

  it("keeps a failed message to retry with the same client ID", async () => {
    api.conversations.push(conversation("c1"));
    const client = makeClient();
    await client.open("c1");
    let fail = true;
    api.override("POST /conversations/c1/messages", () =>
      fail ? { status: 503, body: { error: { code: "unavailable" } } } : undefined,
    );
    await client.send("Hello");
    const [failed] = client.state.messages.c1!;
    expect(failed).toMatchObject({ body: "Hello", state: "failed" });

    fail = false;
    await client.retry(failed!);
    const posts = api.to("/conversations/c1/messages", "POST");
    expect(posts.map((p) => (p.body as { clientId: string }).clientId)).toEqual([
      failed!.clientId,
      failed!.clientId,
    ]);
    expect(client.state.messages.c1).toEqual([expect.objectContaining({ body: "Hello", state: "sent" })]);
  });

  it("checks files against the plan before uploading, then uploads and verifies them", async () => {
    const put = vi.fn(async () => {});
    const client = makeClient({
      read: async () => ({ size: 10 }) as Blob,
      head: async () => "AAAA",
      put,
    });
    api.override("POST /attachments", () => ({
      status: 201,
      body: { attachment: { id: "a1" }, upload: { url: "https://r2.test/x", method: "PUT", headers: {} } },
    }));
    api.override("POST /attachments/a1/verify", () => ({ status: 204 }));
    await client.open();

    client.addFiles([{ uri: "file:///doc.pdf", name: "doc.pdf", type: "application/pdf" }]);
    expect(client.state.fileError).toMatch(/can't be sent/);
    client.addFiles([{ uri: "file:///big.jpg", name: "big.jpg", type: "image/jpeg", size: 5000 }]);
    expect(client.state.fileError).toMatch(/too large/);

    client.addFiles([{ uri: "file:///ok.jpg", name: "ok.jpg", type: "image" }]);
    await vi.waitFor(() => expect(client.state.files[0]?.state).toBe("ready"));
    expect(api.to("/attachments", "POST")[0]!.body).toEqual({
      fileName: "ok.jpg",
      contentType: "image/jpeg",
      size: 10,
      head: "AAAA",
    });
    expect(put).toHaveBeenCalledOnce();
  });
});
