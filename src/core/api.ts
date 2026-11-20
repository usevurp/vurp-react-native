// The widget API as the SDK calls it. Native apps send no Origin header, so every request names the
// app instead (X-Vurp-Platform, X-Vurp-App-Id); Vurp checks it against the website's apps.

export const SDK_VERSION = "0.1.0";

export class VurpApiError extends Error {
  override name = "VurpApiError";
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type ApiTarget = {
  apiUrl: string;
  platform: "ios" | "android";
  appId: string;
  /** Replaced in tests. */
  fetch?: typeof fetch;
};

export async function apiRequest<T>(
  target: ApiTarget,
  path: string,
  init: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const doFetch = target.fetch ?? fetch;
  const res = await doFetch(`${target.apiUrl.replace(/\/$/, "")}/widget/v1${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      Accept: "application/json",
      "X-Vurp-Platform": target.platform,
      "X-Vurp-App-Id": target.appId,
      "X-Vurp-SDK": `react-native/${SDK_VERSION}`,
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  if (!res.ok) {
    throw new VurpApiError(
      res.status,
      data?.error?.code ?? "error",
      data?.error?.message ?? `Vurp returned HTTP ${res.status}`,
    );
  }
  return data as T;
}
