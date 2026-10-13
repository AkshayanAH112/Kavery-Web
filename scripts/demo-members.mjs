// Demo club members, created through the real API so their photos land in local R2.
//   npm run db:demo:members          (needs `npm run dev` running; local only)
//   npm run db:demo:members:clear
// Two applications waiting for review, one approved member, and one approved member
// with a renewal waiting. The names, numbers and NICs are invented; the photo is an app icon.
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";

const [mode, BASE = "http://localhost:3000"] = process.argv.slice(2);
// Remembers what was created so `remove` deletes exactly that and nothing else.
const STATE = new URL("../.wrangler/demo-members.json", import.meta.url);
const vars = Object.fromEntries(readFileSync(".dev.vars", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));

let cookie = "";
const call = async (method, path, body) => {
  const isForm = body instanceof FormData;
  const res = await fetch(BASE + path, { method, headers: { ...(isForm ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) }, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
};
const form = (fields) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
};
const photo = () => new Blob([readFileSync("public/icons/icon-512.png")], { type: "image/png" });

await call("POST", "/api/auth/login", { email: vars.SEED_ADMIN_EMAIL, password: vars.SEED_ADMIN_PASSWORD });

if (mode === "remove") {
  if (!existsSync(STATE)) process.exit(0);
  for (const id of JSON.parse(readFileSync(STATE, "utf8")).members) await call("DELETE", `/api/members/${id}`).catch(() => {});
  rmSync(STATE);
  console.log("removed");
  process.exit(0);
}

const state = { members: [] };
const save = () => writeFileSync(STATE, JSON.stringify(state));
const idOf = async (name) => (await call("GET", "/api/members")).members.find((m) => m.fullName === name)._id;

const applicants = [
  { fullName: "Demo Member One", dateOfBirth: "1992-03-14", gender: "Male", phone: "0700000001", nic: "920000001V", address: "Demo Road, Periyaneelavanai", jobCategory: "other", jobOther: "Teacher", memberType: "Playing Member", interest: "All-Rounder" },
  { fullName: "Demo Applicant Two", dateOfBirth: "2001-08-02", gender: "Female", phone: "0700000002", nic: "200100000002", address: "Demo Road, Periyaneelavanai", jobCategory: "undergraduate", memberType: "Non-Playing Member" },
  { fullName: "Demo Junior Three", dateOfBirth: `${new Date().getUTCFullYear() - 13}-01-20`, gender: "Male", phone: "0700000003", address: "Demo Road, Periyaneelavanai", guardianName: "Demo Parent", guardianPhone: "0700000003", jobCategory: "school_student", memberType: "Junior Member", interest: "Bowler" },
  { fullName: "Demo Member Four", dateOfBirth: "1985-11-30", gender: "Male", phone: "0700000004", nic: "850000004V", address: "Demo Road, Periyaneelavanai", jobCategory: "other", jobOther: "Fisherman", memberType: "Playing Member", interest: "Batsman" },
];
for (const a of applicants) {
  // Sent through the public form's endpoint, exactly as a visitor would.
  await call("POST", "/api/public/members", form({ ...a, consent: "yes", photo: photo() }));
  state.members.push(await idOf(a.fullName));
  save();
}
const [one, , , four] = state.members;
await call("PATCH", `/api/members/${one}`, { status: "approved" });
await call("PATCH", `/api/members/${four}`, { status: "approved", reviewNotes: "Demo: paid in person." });
// A renewal is only asked for a slip when the club charges a fee, so this works with the default settings.
const settings = (await call("GET", "/api/membership-settings")).settings;
if (!settings.feeEnabled) await call("POST", "/api/public/members/renew", form({ phone: "0700000004", nic: "850000004V", jobCategory: "other", jobOther: "Fisherman" }));
console.log(JSON.stringify({ approved: one, waiting: state.members[1], renewal: four }));
