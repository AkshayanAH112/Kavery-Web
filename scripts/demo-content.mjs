// Demo news posts and gallery albums, created through the real API so uploads land in local R2.
//   npm run db:demo:content          (needs `npm run dev` running; local only)
//   npm run db:demo:content:clear
// The pictures are generated colour fields standing in for real photographs, so the
// home page's news and gallery rows can be judged before the club has uploaded anything.
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { deflateSync } from "node:zlib";

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

/* A small PNG, written by hand: a two-colour diagonal wash with soft bands. */
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
function picture([r1, g1, b1], [r2, g2, b2], bands) {
  const W = 960, H = 720;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    const row = y * (W * 3 + 1);
    for (let x = 0; x < W; x++) {
      const t = (x / W) * 0.6 + (y / H) * 0.4;
      const wave = 0.5 + 0.5 * Math.sin((x + y * 1.6) / (W / bands));
      const k = Math.min(1, Math.max(0, t * 0.75 + wave * 0.25));
      const i = row + 1 + x * 3;
      raw[i] = r1 + (r2 - r1) * k;
      raw[i + 1] = g1 + (g2 - g1) * k;
      raw[i + 2] = b1 + (b2 - b1) * k;
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(W, 0);
  head.writeUInt32BE(H, 4);
  head.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PALETTE = [
  [[224, 0, 0], [40, 6, 6], 3],
  [[255, 242, 0], [150, 60, 0], 5],
  [[0, 48, 132], [8, 14, 40], 4],
  [[26, 120, 70], [8, 30, 22], 6],
  [[190, 70, 20], [30, 12, 6], 2],
  [[110, 110, 122], [16, 16, 20], 7],
];
const upload = async (folder, n) => {
  const [a, b, bands] = PALETTE[n % PALETTE.length];
  const form = new FormData();
  form.append("folder", folder);
  form.append("file", new Blob([picture(a, b, bands)], { type: "image/png" }), `demo-${n}.png`);
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

// Oldest first, so the last one created sits at the front of the row. One has no cover on purpose.
const POSTS = [
  { title: "Demo: ground repairs finished", excerpt: "A demo story. The outfield has been levelled ahead of the new season.", category: "news", cover: 4 },
  { title: "Demo: scholarship results day", excerpt: "A demo notice from the education wing about results.", category: "education", org: "keda", cover: null },
  { title: "Demo: under-15 trials this weekend", excerpt: "A demo story. Trials are open to every child in the village.", category: "news", cover: 3 },
  { title: "Demo: KEDA class notice", excerpt: "A demo notice from the education wing.", category: "education", org: "keda", cover: 2 },
  { title: "Demo: a new season begins", excerpt: "A demo story so the news pages have something to show. Replace it with a real one.", category: "news", cover: 0 },
];
for (const p of POSTS) {
  const cover = p.cover === null ? null : await upload("news", p.cover);
  const { post } = await call("POST", "/api/posts", {
    title: p.title,
    excerpt: p.excerpt,
    content: "<p>This is a <strong>demo post</strong>. It was written by the demo script, not by the club.</p><h2>What to do with it</h2><ul><li>Open it in the console under News</li><li>Edit it, or delete it</li></ul><p>Real stories are written in the same editor.</p>",
    category: p.category,
    org: p.org,
    tags: ["demo"],
    status: "published",
    ...(cover ? { coverImageUrl: cover.url, coverImagePublicId: cover.publicId } : {}),
  });
  state.posts.push(post._id);
  save();
}

const ALBUMS = [
  { name: "Demo album: annual sports meet", photos: [1, 0, 3] },
  { name: "Demo album: KEDA prize giving", org: "keda", photos: [2, 5] },
  { name: "Demo album: village tournament", photos: [3, 4, 0, 1] },
  { name: "Demo album: practice evenings", photos: [5, 2] },
  { name: "Demo album: club day", photos: [0, 4, 2] },
];
for (const a of ALBUMS) {
  const { folder } = await call("POST", "/api/gallery/folders", { name: a.name, org: a.org });
  state.folders.push(folder._id);
  save();
  for (const n of a.photos) {
    const up = await upload("gallery", n);
    await call("POST", `/api/gallery/folders/${folder._id}/images`, { url: up.url, publicId: up.publicId, caption: "Demo photo" });
  }
}
console.log(JSON.stringify({ posts: state.posts.length, albums: state.folders.length }));
