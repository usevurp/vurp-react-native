/** What a Vurp reply notification carries (vurp-server src/modules/push/reply-push.ts). */
export type VurpNotification = { conversationId: string; messageId: string; projectId: string };

/**
 * Reads Vurp's fields from a notification's data, however your push library hands it over:
 * Firebase (`remoteMessage.data`), Expo (`notification.request.content.data`) or APNs (the payload).
 * Returns null for anything that isn't a Vurp reply.
 */
export function parseNotification(data: unknown): VurpNotification | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.vurp !== "reply") return null;
  const { conversationId, messageId, projectId } = d;
  if (typeof conversationId !== "string" || typeof projectId !== "string") return null;
  return { conversationId, projectId, messageId: typeof messageId === "string" ? messageId : "" };
}
