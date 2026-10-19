"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus, Loader2, UserRound, X } from "lucide-react";
import { siteImageUrl } from "@/lib/site-settings";
import { uploadImage } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

/**
 * Picks one picture for Site details: a committee member's photo or a sponsor's logo.
 * The file is shrunk in the browser and uploaded at once; the form keeps only its key,
 * and the picture appears on the site when the form is saved.
 */
export function PhotoPicker({ value, onChange, kind, label }: { value: string; onChange: (key: string) => void; kind: "photo" | "logo"; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange((await uploadImage(file, "site")).publicId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex w-32 shrink-0 flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={value ? `Change ${label}` : `Add ${label}`}
        className={cn(
          "relative flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-[var(--field-radius)] border border-dashed border-line text-muted-foreground transition-colors hover:bg-muted disabled:cursor-wait",
          kind === "logo" && value && "bg-white",
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
      <div className="flex items-center gap-2 text-xs">
        <label htmlFor={inputId} className="cursor-pointer font-semibold text-fg underline-offset-2 hover:underline">
          {value ? "Change" : kind === "photo" ? "Add photo" : "Add logo"}
        </label>
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
    </div>
  );
}
