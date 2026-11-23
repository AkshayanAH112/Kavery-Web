"use client";

import { useId, useRef, useState } from "react";
import { Crop, ImagePlus, Loader2, UserRound, X } from "lucide-react";
import { SITE_LOGO_ASPECT, SITE_PHOTO_ASPECT, siteImageUrl } from "@/lib/site-settings";
import { PhotoCropper } from "./photo-editor";
import { uploadImage } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

/**
 * Picks one picture for Site details: a committee member's photo or a sponsor's logo.
 * Every picture goes through the cropper first, in the shape the public site shows it
 * (a 4:5 portrait, a 3:2 logo tile). The result is uploaded at once; the form keeps only
 * its key, and the picture appears on the site when the form is saved. "Crop" re-opens
 * the cropper on the picture already uploaded, for ones added before there was a cropper.
 */
export function PhotoPicker({ value, onChange, kind, label }: { value: string; onChange: (key: string) => void; kind: "photo" | "logo"; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<File | null>(null);
  const logo = kind === "logo";

  function pick(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    setError(null);
    setEditing(file);
  }

  async function upload(file: File) {
    setEditing(null);
    setBusy(true);
    setError(null);
    try {
      onChange((await uploadImage(file, "site")).publicId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  // The uploaded picture is ours (same origin), so it can be read back into the cropper.
  async function recrop() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(siteImageUrl(value));
      if (!res.ok) throw new Error("The picture could not be opened.");
      const blob = await res.blob();
      setEditing(new File([blob], "picture", { type: blob.type }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The picture could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-32 shrink-0 flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={value ? `Change ${label}` : `Add ${label}`}
        // The same shape as the crop, so what is seen here is what the site shows.
        className={cn(
          "relative flex cursor-pointer items-center justify-center overflow-hidden rounded-[var(--field-radius)] border border-dashed border-line text-muted-foreground transition-colors hover:bg-muted disabled:cursor-wait",
          logo ? "aspect-[3/2] w-28" : "aspect-[4/5] w-24",
          logo && value && "bg-white",
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- a just-uploaded file, already resized
          <img src={siteImageUrl(value)} alt="" className={cn("size-full", kind === "photo" ? "object-cover" : "object-contain p-2")} />
        ) : kind === "photo" ? (
          <UserRound size={32} aria-hidden />
        ) : (
          <ImagePlus size={28} aria-hidden />
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
            <Loader2 className="animate-spin" size={22} aria-hidden />
          </span>
        )}
      </button>
      <input ref={input} id={inputId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs">
        <label htmlFor={inputId} className="cursor-pointer font-semibold text-fg underline-offset-2 hover:underline">
          {value ? "Change" : kind === "photo" ? "Add photo" : "Add logo"}
        </label>
        {value && (
          <button type="button" onClick={recrop} disabled={busy} className="inline-flex cursor-pointer items-center gap-0.5 font-semibold text-fg hover:underline disabled:opacity-50">
            <Crop size={12} aria-hidden /> Crop
          </button>
        )}
        {value && (
          <button type="button" onClick={() => onChange("")} className="inline-flex cursor-pointer items-center gap-0.5 text-danger hover:underline">
            <X size={12} aria-hidden /> Remove
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="max-w-32 text-center text-xs text-danger">
          {error}
        </p>
      )}
      {editing && (
        <PhotoCropper
          file={editing}
          aspect={logo ? SITE_LOGO_ASPECT : SITE_PHOTO_ASPECT}
          fit={logo}
          title={logo ? "Adjust logo" : "Adjust photo"}
          onCancel={() => setEditing(null)}
          onDone={upload}
        />
      )}
    </div>
  );
}
