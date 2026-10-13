"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PostEditor, type PostDraft } from "@/components/content/post-editor";

export default function EditPostPage() {
  const params = useParams();
  const id = params.id as string;
  const [post, setPost] = useState<PostDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/posts/${id}`)
      .then((r) => r.json() as any)
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setPost({
          _id: d.post._id,
          title: d.post.title ?? "",
          excerpt: d.post.excerpt ?? "",
          content: d.post.content ?? "",
          category: d.post.category ?? "news",
          org: d.post.org === "keda" ? "keda" : "ksc",
          tags: d.post.tags ?? [],
          status: d.post.status ?? "draft",
          author: d.post.author ?? "",
          coverImageUrl: d.post.coverImageUrl ?? "",
          coverImagePublicId: d.post.coverImagePublicId ?? "",
          images: d.post.images ?? [],
        });
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error)
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
      >
        {error}
      </div>
    );

  if (!post)
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );

  return <PostEditor initial={post} />;
}
