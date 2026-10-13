import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { isPostCategory, postDoc } from "@/lib/content/server";

const P = schema.posts;

/** The public feed: published posts only, newest publication first. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const category = q.get("category");
  const limit = Math.min(Math.max(Number(q.get("limit")) || 12, 1), 50);
  const page = Math.max(Number(q.get("page")) || 1, 1);
  const where = and(eq(P.status, "published"), isPostCategory(category) ? eq(P.category, category) : undefined);

  const db = getDb();
  const [rows, total] = await Promise.all([db.select().from(P).where(where).orderBy(desc(P.publishedAt), desc(P.createdAt)).limit(limit).offset((page - 1) * limit), db.$count(P, where)]);
  return Response.json({ posts: rows.map(postDoc), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}
