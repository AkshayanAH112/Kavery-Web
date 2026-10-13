// Demo news posts and a gallery album, created through the real API so uploads land in local R2.
//   npm run db:demo:content          (needs `npm run dev` running; local only)
//   npm run db:demo:content:clear
// The pictures are the two crests, standing in for real photographs.
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";

const [mode, BASE = "http://localhost:3000"] = process.argv.slice(2);
// Remembers what was created so `remove` deletes exactly that and nothing else.
const STATE = new URL("../.wrangler/demo-content.json", import.meta.url);
const vars = Object.fromEntries(readFileSync(".dev.vars", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));

let cookie = "";
const call = async (method, path, body) => {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
};
const upload = async (folder, file, type) => {
  const form = new FormData();
  form.append("folder", folder);
  form.append("file", new Blob([readFileSync(file)], { type }), file.split("/").pop());
  const res = await fetch(BASE + "/api/upload", { method: "POST", headers: { cookie }, body: form });
  if (!res.ok) throw new Error(`upload -> ${res.status}`);
  return res.json();
};
await call("POST", "/api/auth/login", { email: vars.SEED_ADMIN_EMAIL, password: vars.SEED_ADMIN_PASSWORD });

if (mode === "remove") {
  if (!existsSync(STATE)) process.exit(0);
  const s = JSON.parse(readFileSync(STATE, "utf8"));
  for (const id of s.posts) await call("DELETE", `/api/posts/${id}`).catch(() => {});
  for (const id of s.folders) await call("DELETE", `/api/gallery/folders/${id}`).catch(() => {});
  rmSync(STATE);
  console.log("removed");
  process.exit(0);
}

const state = { posts: [], folders: [] };
const save = () => writeFileSync(STATE, JSON.stringify(state));

const cover = await upload("news", "public/brand/ksc-crest.png", "image/png");
const post1 = await call("POST", "/api/posts", {
  title: "Demo: a new season begins",
  excerpt: "A demo story so the news pages have something to show. Replace it with a real one.",
  content: "<p>This is a <strong>demo post</strong>. It was written by the demo script, not by the club.</p><h2>What to do with it</h2><ul><li>Open it in the console under News</li><li>Edit it, or delete it</li></ul><p>Real stories are written in the same editor.</p>",
  category: "news",
  tags: ["demo"],
  status: "published",
  coverImageUrl: cover.url,
  coverImagePublicId: cover.publicId,
});
state.posts.push(post1.post._id); save();

const kedaCover = await upload("news", "public/brand/keda-logo.png", "image/png");
const post2 = await call("POST", "/api/posts", {
  title: "Demo: KEDA class notice",
  excerpt: "A demo notice from the education wing.",
  content: "<p>This is a demo notice for the Kavery Education Development Association.</p>",
  category: "education",
  org: "keda",
  status: "published",
  coverImageUrl: kedaCover.url,
  coverImagePublicId: kedaCover.publicId,
});
state.posts.push(post2.post._id); save();

const album = await call("POST", "/api/gallery/folders", { name: "Demo album" });
state.folders.push(album.folder._id); save();
for (const [file, type, caption] of [
  ["public/brand/ksc-crest.png", "image/png", "Demo photo: the club crest"],
  ["public/brand/keda-logo.png", "image/png", "Demo photo: the KEDA logo"],
  ["public/icons/icon-512.png", "image/png", "Demo photo"],
]) {
  const up = await upload("gallery", file, type);
  await call("POST", `/api/gallery/folders/${album.folder._id}/images`, { url: up.url, publicId: up.publicId, caption });
}
console.log(JSON.stringify({ post: post1.post.slug, postId: post1.post._id, album: album.folder._id }));
