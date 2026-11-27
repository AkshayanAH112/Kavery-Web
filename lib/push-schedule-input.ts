import { z } from "zod";
import { ScheduleRule } from "@/lib/push-schedule";
import { PUSH_TOPICS } from "@/lib/push-topics";

/** What the console sends to create or edit a scheduled notification. */
export const ScheduleInput = z.object({
  topic: z.enum(PUSH_TOPICS),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().max(240).optional(),
  // Same-site paths only, as when sending now. Empty means none.
  url: z.union([z.literal(""), z.string().trim().regex(/^\/(?!\/)/).max(300)]).optional(),
  // A poster uploaded to notices/ through /api/upload; checked with ownMedia().
  image: z.object({ url: z.string().max(300), publicId: z.string().max(200) }).optional(),
  rule: ScheduleRule,
});

export function scheduleError(error: z.ZodError) {
  const rule = error.issues.find((i) => i.path[0] === "rule" && i.code === "custom");
  return Response.json({ error: rule?.message ?? "Add a title, a date and a time, and make the link a path on this site (for example /en/news)." }, { status: 400 });
}

export const PASSED = () => Response.json({ error: "That time has already passed, or the repeat ends before it would next go out. Choose a later time." }, { status: 400 });
export const NOT_FOUND = () => Response.json({ error: "That scheduled notification no longer exists." }, { status: 404 });
