"use client";

import { PostEditor, emptyPost } from "@/components/content/post-editor";

export default function NewPostScreen() {
  return <PostEditor initial={emptyPost} />;
}
