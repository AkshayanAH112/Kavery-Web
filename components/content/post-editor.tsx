"use client";

import { POST_CATEGORIES, POST_CATEGORY_LABELS } from "@/lib/post-categories";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Loader2,
  ImagePlus,
  Trash2,
  Save,
  Send,
  ArrowLeft,
  AlertTriangle,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { RichTextEditor } from "@/components/content/rich-text-editor";
import { MAX_POST_IMAGES } from "@/lib/media";
import { uploadImage, uploadMany } from "@/lib/upload-client";

export type PostImage = { url: string; publicId?: string; caption?: string };

export type PostDraft = {
  _id?: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  /** Whose post it is. KEDA's posts are also the announcements parents see. */
  org: "ksc" | "keda";
  tags: string[];
  status: "draft" | "published";
  author: string;
  coverImageUrl?: string;
  coverImagePublicId?: string;
  images: PostImage[];
};

export const emptyPost: PostDraft = {
  title: "",
  excerpt: "",
  content: "",
  category: "news",
  org: "ksc",
  tags: [],
  status: "draft",
  author: "",
  images: [],
};

const CATEGORIES = POST_CATEGORIES.map((value) => ({
  value,
  label: POST_CATEGORY_LABELS[value],
}));

export function PostEditor({ initial }: { initial: PostDraft }) {
  const router = useRouter();
  const isEdit = Boolean(initial._id);

  const [post, setPost] = useState<PostDraft>(initial);
  const [tagsInput, setTagsInput] = useState(initial.tags.join(", "));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"cover" | "gallery" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof PostDraft>(key: K, value: PostDraft[K]) =>
    setPost((p) => ({ ...p, [key]: value }));

  const uploadFile = (file: File) => uploadImage(file, "news");

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading("cover");
    setError(null);
    try {
      const { url, publicId } = await uploadFile(file);
      setPost((p) => ({ ...p, coverImageUrl: url, coverImagePublicId: publicId }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(null);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    // Only as many as still fit, so nothing is uploaded that the post would refuse.
    const room = Math.max(0, MAX_POST_IMAGES - post.images.length);
    const files = picked.slice(0, room);
    setError(null);
    if (files.length === 0) {
      setError(`A post can have at most ${MAX_POST_IMAGES} gallery images. Put the rest in a gallery album.`);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
      return;
    }
    setUploading("gallery");
    try {
      const settled = await uploadMany(files, uploadFile);
      const uploaded = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
      if (uploaded.length > 0) {
        setPost((p) => ({
          ...p,
          images: [...p.images, ...uploaded.map((u) => ({ ...u, caption: "" }))],
        }));
      }
      const problems: string[] = [];
      const failed = settled.length - uploaded.length;
      if (failed > 0) problems.push(`${failed} of ${settled.length} photos failed to upload. Add the missing ones again.`);
      if (picked.length > files.length) problems.push(`${picked.length - files.length} photos were left out: a post can have at most ${MAX_POST_IMAGES} gallery images. Put the rest in a gallery album.`);
      if (problems.length) setError(problems.join(" "));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(null);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const removeGalleryImage = (index: number) =>
    setPost((p) => ({ ...p, images: p.images.filter((_, i) => i !== index) }));

  const setCaption = (index: number, caption: string) =>
    setPost((p) => ({
      ...p,
      images: p.images.map((img, i) => (i === index ? { ...img, caption } : img)),
    }));

  const save = async (status: "draft" | "published") => {
    if (!post.title.trim()) return setError("A title is required.");
    if (!post.content.trim()) return setError("Post content is required.");

    setSaving(true);
    setError(null);
    const payload = {
      ...post,
      status,
      tags: tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };

    try {
      const res = await fetch(isEdit ? `/api/posts/${post._id}` : "/api/posts", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error || "Save failed");
      router.push("/console/news");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const remove = async () => {
    if (!isEdit) return;
    setConfirmDeleteOpen(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${post._id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json() as any).error || "Delete failed");
      router.push("/console/news");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/console/news")}
        className="flex cursor-pointer items-center gap-2 text-muted-foreground transition-colors duration-200 hover:text-foreground"
      >
        <ArrowLeft size={20} aria-hidden /> Back to posts
      </button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl text-foreground">{isEdit ? "Edit post" : "New post"}</h1>
          <p className="text-muted-foreground">
            Published posts appear on the club&apos;s public website.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isEdit && (
            <button
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={saving}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-destructive/30 px-4 py-2 font-medium text-destructive transition-colors duration-200 hover:bg-destructive/10 disabled:opacity-60"
            >
              <Trash2 size={16} aria-hidden /> Delete
            </button>
          )}
          <button
            onClick={() => save("draft")}
            disabled={saving}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 font-medium text-foreground transition-colors duration-200 hover:bg-muted disabled:opacity-60"
          >
            <Save size={16} aria-hidden /> Save draft
          </button>
          <button
            onClick={() => save("published")}
            disabled={saving}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <Send size={16} aria-hidden />
            )}
            Publish
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <AlertTriangle size={18} aria-hidden />
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border border-border bg-card p-6 shadow-xs">
            <div className="space-y-4">
              <div>
                <label htmlFor="title" className="field-label">
                  Title
                </label>
                <input
                  id="title"
                  className="field"
                  value={post.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="e.g. Grade 5 scholarship results 2026"
                />
              </div>

              <div>
                <label htmlFor="excerpt" className="field-label">
                  Excerpt
                </label>
                <textarea
                  id="excerpt"
                  className="field"
                  rows={2}
                  value={post.excerpt}
                  onChange={(e) => set("excerpt", e.target.value)}
                  placeholder="One or two lines shown on the website's news cards."
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Leave blank and the landing page will fall back to the opening of the post.
                </p>
              </div>

              <div>
                <label htmlFor="content" className="field-label">
                  Content
                </label>
                <RichTextEditor
                  id="content"
                  content={post.content}
                  onChange={(html) => set("content", html)}
                  placeholder="Write the full post here…"
                />
              </div>
            </div>
          </div>

          {/* Gallery */}
          <div className="rounded-lg border border-border bg-card p-6 shadow-xs">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg text-foreground">Gallery images</h2>
              <button
                onClick={() => galleryInputRef.current?.click()}
                disabled={uploading !== null}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors duration-200 hover:bg-muted disabled:opacity-60"
              >
                {uploading === "gallery" ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : (
                  <ImagePlus size={16} aria-hidden />
                )}
                Add images
              </button>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleGalleryUpload}
              />
            </div>

            {post.images.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No gallery images yet. These appear alongside the article on the website.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {post.images.map((img, i) => (
                  <div key={img.publicId ?? img.url} className="group relative">
                    <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-muted">
                      <Image src={img.url} alt={img.caption || "Post image"} fill className="object-cover" />
                      <button
                        onClick={() => removeGalleryImage(i)}
                        aria-label="Remove image"
                        className="absolute top-1.5 right-1.5 cursor-pointer rounded-md bg-destructive p-1 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <X size={14} aria-hidden />
                      </button>
                    </div>
                    <input
                      className="field mt-2 h-8 text-xs"
                      placeholder="Caption"
                      value={img.caption ?? ""}
                      onChange={(e) => setCaption(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-6 shadow-xs">
            <h2 className="mb-4 text-lg text-foreground">Cover image</h2>
            {post.coverImageUrl ? (
              <div className="space-y-3">
                <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-muted">
                  <Image src={post.coverImageUrl} alt="Cover" fill className="object-cover" />
                </div>
                <button
                  onClick={() =>
                    setPost((p) => ({ ...p, coverImageUrl: "", coverImagePublicId: "" }))
                  }
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm font-medium transition-colors duration-200 hover:bg-muted"
                >
                  <Trash2 size={14} aria-hidden /> Remove cover
                </button>
              </div>
            ) : (
              <button
                onClick={() => coverInputRef.current?.click()}
                disabled={uploading !== null}
                className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground transition-colors duration-200 hover:border-gold hover:text-foreground disabled:opacity-60"
              >
                {uploading === "cover" ? (
                  <Loader2 size={24} className="animate-spin" aria-hidden />
                ) : (
                  <ImagePlus size={24} aria-hidden />
                )}
                Upload cover image
              </button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCoverUpload}
            />
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-xs">
            <div>
              <label htmlFor="org" className="field-label">
                Posted by
              </label>
              <select id="org" className="field cursor-pointer" value={post.org} onChange={(e) => set("org", e.target.value === "keda" ? "keda" : "ksc")}>
                <option value="ksc">Kavery Sports Club</option>
                <option value="keda">KEDA (education)</option>
              </select>
              <p className="mt-1.5 text-sm text-muted-foreground">KEDA posts also appear as announcements on the parent page, and notify people who asked for class notices.</p>
            </div>
            <div>
              <label htmlFor="category" className="field-label">
                Category
              </label>
              <select
                id="category"
                className="field cursor-pointer"
                value={post.category}
                onChange={(e) => set("category", e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tags" className="field-label">
                Tags
              </label>
              <input
                id="tags"
                className="field"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="cricket, grade 5, prize giving"
              />
              <p className="mt-1 text-xs text-muted-foreground">Separate with commas.</p>
            </div>

            <div>
              <label htmlFor="author" className="field-label">
                Author
              </label>
              <input
                id="author"
                className="field"
                value={post.author}
                onChange={(e) => set("author", e.target.value)}
              />
            </div>

            {isEdit && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <span className="text-muted-foreground">Current status: </span>
                <span
                  className={`font-semibold ${
                    post.status === "published" ? "text-success" : "text-warning"
                  }`}
                >
                  {post.status === "published" ? "Published" : "Draft"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={remove}
        title="Delete this post?"
        description="Its images are removed from Cloudinary too. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
      />
    </div>
  );
}
