import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { postDoc } from "@/lib/content/server";

const P = schema.posts;

export async function GET(_request: Request, { params }: RouteContext<"/api/public/posts/[slug]">) {
  const { slug } = await params;
  // A draft answers 404 here exactly like a post that does not exist.
  const post = await getDb().query.posts.findFirst({ where: and(eq(P.slug, slug), eq(P.status, "published")) });
  return post ? Response.json({ post: postDoc(post) }) : Response.json({ error: "Post not found" }, { status: 404 });
}
