/**
 * Roles and what each may do. This file is the single source of truth: the API
 * guards (lib/auth/guard.ts) and the console navigation both read it, and it has
 * no server imports so client components can use it too.
 *
 * Hiding a link is UX. The API re-checking the permission on every request is
 * the actual boundary.
 */
export const ROLES = ["admin", "education", "attendance", "scorer", "editor"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  /** Create, change and deactivate staff accounts. */
  "staff.manage": ["admin"],
  /** Edit public-site content and settings. */
  "site.manage": ["admin"],
  /** Send push notifications to subscribers. */
  "push.send": ["admin"],
  /** Review and manage club membership (the only area with money in it). */
  "members.manage": ["admin"],
  /** News posts and gallery albums. */
  "content.manage": ["admin", "editor", "education"],
  /** KEDA students, batches, classes, exams, marks and analysis. */
  "education.manage": ["admin", "education"],
  /** Scan or mark attendance for a class. Nothing else in the LMS. */
  "attendance.mark": ["admin", "education", "attendance"],
  /** Tournaments, publishing and deleting cricket records. */
  "cricket.manage": ["admin"],
  /** Teams, squads, matches and ball-by-ball scoring. */
  "cricket.score": ["admin", "scorer"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  education: "Education manager",
  attendance: "Attendance marker",
  scorer: "Scorer",
  editor: "Editor",
};

export const ROLE_SUMMARIES: Record<Role, string> = {
  admin: "Everything: staff, members, the public site, education and cricket.",
  education: "KEDA classes: students, attendance, exams and marks. No club membership.",
  attendance: "Marks attendance for a class. Cannot see marks, members or staff.",
  scorer: "Sets up teams and matches and scores them ball by ball.",
  editor: "Writes news and manages the gallery.",
};
