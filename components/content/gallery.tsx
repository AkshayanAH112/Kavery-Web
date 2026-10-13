"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Plus, Trash2, Folder, ImageIcon } from "lucide-react";
import { Button } from "@/components/console/ui";

type GalleryFolder = {
  _id: string;
  name: string;
  coverImageUrl?: string;
  imageCount: number;
  createdAt: string;
};

export default function GalleryFoldersPage() {
  const [folders, setFolders] = useState<GalleryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderOrg, setNewFolderOrg] = useState("ksc");
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);

  const fetchFolders = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gallery/folders");
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error);
      
      // Data contains full folders, map them to what we need
      const mapped = data.folders.map((f: any) => ({
        ...f,
        imageCount: f.images?.length || 0
      }));
      setFolders(mapped);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  const submitCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/gallery/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim(), org: newFolderOrg })
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error);
      
      setFolders([{ ...data.folder, imageCount: 0 }, ...folders]);
      setIsCreateModalOpen(false);
      setNewFolderName("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const deleteFolder = (id: string, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigating to the folder
    setFolderToDelete(id);
  };
  
  const confirmDelete = async () => {
    if (!folderToDelete) return;
    try {
      const res = await fetch(`/api/gallery/folders/${folderToDelete}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json() as any).error);
      setFolders(folders.filter(f => f._id !== folderToDelete));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFolderToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gallery Folders</h1>
          <p className="text-muted-foreground">
            Manage photo albums shown in the club website&apos;s Gallery section.
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)} disabled={creating} className="gap-2">
          {creating ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
          Create Folder
        </Button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="animate-spin text-primary" size={40} />
        </div>
      ) : folders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-16 text-center">
          <Folder size={40} className="text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No gallery folders yet — create one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {folders.map((folder) => (
            <Link 
              key={folder._id} 
              href={`/console/gallery/${folder._id}`}
              className="group block overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-all hover:border-primary/50 hover:shadow-md"
            >
              <div className="relative aspect-[4/3] bg-muted flex items-center justify-center">
                {folder.coverImageUrl ? (
                  <Image src={folder.coverImageUrl} alt={folder.name} fill className="object-cover" />
                ) : (
                  <ImageIcon size={40} className="text-muted-foreground/30" />
                )}
                
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                
                <button
                  onClick={(e) => deleteFolder(folder._id, e)}
                  aria-label="Delete folder"
                  className="absolute top-2 right-2 rounded-lg bg-black/60 p-1.5 text-white transition-colors duration-200 hover:bg-destructive"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-foreground line-clamp-1">{folder.name}</h3>
                <p className="text-sm text-muted-foreground">{folder.imageCount} {folder.imageCount === 1 ? 'image' : 'images'}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Folder Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border p-6 sm:p-8 rounded-3xl max-w-sm w-full shadow-2xl">
            <h2 className="text-xl font-bold mb-6 text-foreground">New Folder</h2>
            <form onSubmit={submitCreateFolder} className="space-y-4">
              <div>
                <label className="field-label">Folder Name</label>
                <input 
                  required 
                  autoFocus
                  className="field" 
                  placeholder="e.g. Annual Match 2026" 
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)} 
                />
              </div>
              <div>
                <label htmlFor="folder-org" className="field-label">Album of</label>
                <select id="folder-org" className="field cursor-pointer" value={newFolderOrg} onChange={e => setNewFolderOrg(e.target.value)}>
                  <option value="ksc">Kavery Sports Club</option>
                  <option value="keda">KEDA (education)</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setIsCreateModalOpen(false); setNewFolderName(""); }} className="flex-1 py-2 border border-border bg-card rounded-xl font-medium text-foreground hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" disabled={creating} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground py-2 rounded-xl font-medium flex items-center justify-center gap-2">
                  {creating ? <Loader2 size={16} className="animate-spin" /> : null}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {folderToDelete && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border p-6 sm:p-8 rounded-3xl max-w-sm w-full shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-foreground">Delete Folder?</h2>
            <p className="text-muted-foreground mb-6">Are you sure you want to delete this folder and ALL images inside it? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setFolderToDelete(null)} className="flex-1 py-2 border border-border bg-card rounded-xl font-medium text-foreground hover:bg-muted transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground py-2 rounded-xl font-medium">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
