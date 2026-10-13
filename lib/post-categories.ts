/**
 * Post categories. Client-safe (no server imports), so the editor and the API
 * read the same list.
 */
export const POST_CATEGORIES = ["news", "blog", "event", "achievement", "match", "community", "education", "announcement"] as const;

export type PostCategory = (typeof POST_CATEGORIES)[number];

export const POST_CATEGORY_LABELS: Record<PostCategory, string> = {
  news: "News",
  blog: "Blog",
  event: "Event",
  achievement: "Achievement",
  match: "Match report",
  community: "Community service",
  education: "Education",
  announcement: "Announcement",
};

export const isPostCategory = (value: unknown): value is PostCategory => typeof value === "string" && (POST_CATEGORIES as readonly string[]).includes(value);

export function postCategoryLabel(value: string): string {
  return POST_CATEGORY_LABELS[value as PostCategory] ?? value;
}
