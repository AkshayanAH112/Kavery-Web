/** Client-safe: no server imports. `staff` is only ever added for a signed-in staff member. */
export const PUSH_TOPICS = ["cricket", "news", "keda", "staff"] as const;
export type PushTopic = (typeof PUSH_TOPICS)[number];
export const PUBLIC_PUSH_TOPICS = ["cricket", "news", "keda"] as const satisfies readonly PushTopic[];

export function isPushTopic(value: unknown): value is PushTopic {
  return typeof value === "string" && (PUSH_TOPICS as readonly string[]).includes(value);
}
