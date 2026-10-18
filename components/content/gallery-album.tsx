"use client";

import { uploadImage, uploadMany } from "@/lib/upload-client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2, Upload, Trash2, ImageIcon, ChevronLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/console/ui";

type GalleryImage = {
  _id: string;
  url: string;
  publicId?: string;
  caption?: string;
  createdAt: string;
};

type GalleryFolder = {
  _id: string;
  name: string;
  coverImageUrl?: string;
  images: GalleryImage[];
};

export default function FolderGalleryPage() {
  const params = useParams();
  const id = params.id as string;
  
  const [folder, setFolder] = useState<GalleryFolder | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFolder = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gallery/folders/${id}`);
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error);
      setFolder(data.folder);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchFolder();
  }, [id]);

  const uploadOne = async (file: File) => {
    const uploaded = await uploadImage(file, "gallery");

    const res = await fetch(`/api/gallery/folders/${id}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: uploaded.url, publicId: uploaded.publicId }),
    });
    const data = await res.json() as any;
    if (!res.ok) throw new Error(data.error);
    return data.image as GalleryImage;
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const settled = await uploadMany(files, uploadOne);
      const succeeded = settled
        .filter((r): r is PromiseFulfilledResult<GalleryImage> => r.status === "fulfilled")
        .map((r) => r.value);
      const failedCount = settled.length - succeeded.length;
      if (succeeded.length > 0) {
        setFolder((prev) => prev ? { ...prev, images: [...succeeded, ...prev.images] } : null);
      }
      if (failedCount > 0) {
        setError(`${failedCount} of ${settled.length} photo${settled.length === 1 ? "" : "s"} failed to upload. Please try again for the ones missing.`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateCaption = async (imageId: string, caption: string) => {
    setFolder((prev) => prev ? {
      ...prev,
      images: prev.images.map((img) => (img._id === imageId ? { ...img, caption } : img))
    } : null);
    
    try {
      await fetch(`/api/gallery/folders/${id}/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption }),
      });
    } catch (e: any) {
      console.error(e);
    }
  };

  const remove = async () => {
    if (!imageToDelete) return;
    try {
      const res = await fetch(`/api/gallery/folders/${id}/images/${imageToDelete}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json() as any).error);
      setFolder((prev) => prev ? {
        ...prev,
        images: prev.images.filter((img) => img._id !== imageToDelete)
      } : null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImageToDelete(null);
    }
  };
  
  const setAsCover = async (imageId: string) => {
    try {
      const res = await fetch(`/api/gallery/folders/${id}/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setAsCover: true }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error);
      
      const image = folder?.images.find(img => img._id === imageId);
      if (image) {
        setFolder((prev) => prev ? {
          ...prev,
          coverImageUrl: image.url
        } : null);
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  if (!folder) {
    return <div>Folder not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <Link 
          href="/console/gallery"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} /> Back to Folders
        </Link>
      </div>
      
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{folder.name}</h1>
          <p className="text-muted-foreground">
            Manage photos in this album.
          </p>
        </div>
        <div className="relative">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            ref={fileInputRef}
            onChange={handleUpload}
            disabled={uploading}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed z-10"
          />
          <Button disabled={uploading} className="gap-2">
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            {uploading ? "Uploading…" : "Upload Photos"}
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {folder.images.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-16 text-center">
          <ImageIcon size={40} className="text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No photos in this folder yet — upload some to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {folder.images.map((img) => {
            const isCover = folder.coverImageUrl === img.url;
            return (
              <div key={img._id} className={`overflow-hidden rounded-lg border bg-card shadow-xs transition-all ${isCover ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}>
                <div className="relative aspect-[4/3] bg-muted group">
                  <Image src={img.url} alt={img.caption || "Gallery photo"} fill className="object-cover" />
                  
                  {isCover && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-primary/90 px-2 py-1 text-xs font-medium text-primary-foreground backdrop-blur-sm">
                      <CheckCircle2 size={12} /> Cover
                    </div>
                  )}
                  
                  {!isCover && (
                    <button
                      onClick={() => setAsCover(img._id)}
                      className="absolute top-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                    >
                      Set as Cover
                    </button>
                  )}
                  
                  <button
                    onClick={() => setImageToDelete(img._id)}
                    aria-label="Delete photo"
                    className="absolute top-2 right-2 rounded-lg bg-black/60 p-1.5 text-white transition-colors duration-200 hover:bg-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Caption (optional)"
                  defaultValue={img.caption}
                  onBlur={(e) => updateCaption(img._id, e.target.value)}
                  className="w-full border-0 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {imageToDelete && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border p-6 sm:p-8 rounded-3xl max-w-sm w-full shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-foreground">Delete Photo?</h2>
            <p className="text-muted-foreground mb-6">Are you sure you want to delete this photo? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setImageToDelete(null)} className="flex-1 py-2 border border-border bg-card rounded-xl font-medium text-foreground hover:bg-muted transition-colors">Cancel</button>
              <button onClick={remove} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground py-2 rounded-xl font-medium">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
