"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Plus, Newspaper, ImageIcon, Pencil } from "lucide-react";
import { postCategoryLabel } from "@/lib/post-categories";

type Post = {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string;
  category: string;
  status: "draft" | "published";
  coverImageUrl?: string;
  images: { url: string }[];
  author: string;
  publishedAt?: string;
  updatedAt: string;
};

const FILTERS = [
  { value: "", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Drafts" },
];

export default function NewsListPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/posts${filter ? `?status=${filter}` : ""}`)
      .then((r) => r.json() as any)
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setPosts(d.posts ?? []);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl text-foreground">News &amp; Blog</h1>
          <p className="text-muted-foreground">
            Posts published here are served to the club website via{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              /api/public/posts
            </code>
            .
          </p>
        </div>
        <Link
          href="/console/news/new"
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
        >
          <Plus size={18} aria-hidden /> New post
        </Link>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="animate-spin text-primary" size={40} />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-16 text-center">
          <Newspaper size={40} className="text-muted-foreground opacity-50" aria-hidden />
          <p className="text-muted-foreground">
            No posts yet. Create one to show news on the club website.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post._id}
              href={`/console/news/${post._id}`}
              className="group card-gold-rule flex cursor-pointer flex-col shadow-xs transition-colors duration-200 hover:border-gold"
            >
              <div className="relative aspect-video overflow-hidden rounded-t-lg bg-muted">
                {post.coverImageUrl ? (
                  <Image
                    src={post.coverImageUrl}
                    alt={post.title}
                    fill
                    sizes="(max-width: 640px) 100vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <ImageIcon size={28} aria-hidden />
                  </div>
                )}
                <span
                  className={`absolute top-2 left-2 rounded-md px-2 py-0.5 text-xs font-bold ${
                    post.status === "published"
                      ? "bg-success text-success-foreground"
                      : "bg-warning text-warning-foreground"
                  }`}
                >
                  {post.status === "published" ? "Published" : "Draft"}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-4">
                <span className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-text-foreground">
                  {postCategoryLabel(post.category)}
                </span>
                <h3 className="text-lg leading-tight text-foreground">{post.title}</h3>
                {post.excerpt && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.excerpt}</p>
                )}
                <div className="mt-auto flex items-center justify-between pt-3 text-xs text-muted-foreground">
                  <span>
                    {post.publishedAt
                      ? new Date(post.publishedAt).toLocaleDateString()
                      : `Edited ${new Date(post.updatedAt).toLocaleDateString()}`}
                  </span>
                  <span className="flex items-center gap-1 transition-colors duration-200 group-hover:text-primary">
                    <Pencil size={12} aria-hidden /> Edit
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
