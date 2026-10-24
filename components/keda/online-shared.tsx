import type { PaperStatus } from "@/lib/keda/online-rules";

/** What the online-paper screens share: how a time reads, what a status is called, where a picture is. */

export const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

export const STATUS: Record<PaperStatus, { label: string; tone: "neutral" | "ok" | "warn" | "brand" }> = {
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Ready, not open yet", tone: "warn" },
  open: { label: "Open now", tone: "ok" },
  closed: { label: "Closed", tone: "neutral" },
};

export type StaffQuestion = {
  _id: string;
  kind: "choice" | "short";
  prompt: string;
  hasImage: boolean;
  options: { id: string; text: string; hasImage: boolean }[];
  answer: string | null;
  accepted: string[];
  marks: number;
  version: number;
};

/** A question's picture, or one of its answers', for staff. `v` only makes a replaced picture load afresh. */
export const staffImage = (paperId: string, q: StaffQuestion, optionId?: string) =>
  `/api/online-papers/${paperId}/questions/${q._id}/image?${optionId ? `option=${optionId}&` : ""}v=${q.version}`;

/** Answers are lettered in the order staff wrote them; each student sees their own order. */
export const letter = (i: number) => String.fromCharCode(65 + i);

/** A question's picture. Served by a signed-in route and already shrunk on upload, so a plain image. */
export function Picture({ src, className }: { src: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a private file behind a signed-in route
  return <img src={src} alt="" className={className} />;
}
