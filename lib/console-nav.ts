import { can, type Permission, type Role } from "@/lib/auth/roles";

/**
 * Every console module: where it sits in the sidebar, who may open it, and
 * whether it is built yet. The sidebar, the search box and the dashboard all
 * read this, so a module switches on in one place (`ready: true`).
 *
 * `icon` is a key into the icon map in components/console/Shell.tsx — this file
 * stays free of React so server code can import it.
 */
export type ConsoleModule = {
  key: string;
  href: string;
  label: string;
  icon: string;
  permission: Permission | null;
  ready: boolean;
};

export type ConsoleGroup = { label: string; items: ConsoleModule[] };

export const CONSOLE_GROUPS: ConsoleGroup[] = [
  {
    label: "Overview",
    items: [{ key: "home", href: "/console", label: "Dashboard", icon: "dashboard", permission: null, ready: true }],
  },
  {
    label: "Cricket",
    items: [
      { key: "matches", href: "/console/cricket", label: "Matches and scoring", icon: "trophy", permission: "cricket.score", ready: true },
      { key: "teams", href: "/console/cricket/teams", label: "Teams", icon: "shield", permission: "cricket.score", ready: true },
      { key: "tournaments", href: "/console/cricket/tournaments", label: "Tournaments", icon: "table", permission: "cricket.manage", ready: true },
    ],
  },
  {
    label: "KEDA classes",
    items: [
      { key: "scanner", href: "/console/scanner", label: "Scan attendance", icon: "scan", permission: "attendance.mark", ready: true },
      { key: "today", href: "/console/attendance/today", label: "Today's registers", icon: "today", permission: "attendance.mark", ready: true },
      { key: "students", href: "/console/students", label: "Students", icon: "students", permission: "education.manage", ready: true },
      { key: "batches", href: "/console/batches", label: "Batches and classes", icon: "calendar", permission: "education.manage", ready: true },
      { key: "attendance", href: "/console/attendance", label: "Attendance report", icon: "report", permission: "education.manage", ready: true },
      { key: "alerts", href: "/console/alerts", label: "Leave alerts", icon: "alert", permission: "education.manage", ready: true },
      { key: "exams", href: "/console/exams", label: "Exams and marks", icon: "marks", permission: "education.manage", ready: true },
      { key: "analysis", href: "/console/analysis", label: "Analysis", icon: "analysis", permission: "education.manage", ready: true },
    ],
  },
  {
    label: "Club",
    items: [
      { key: "members", href: "/console/members", label: "Members", icon: "members", permission: "members.manage", ready: true },
      { key: "news", href: "/console/news", label: "News", icon: "news", permission: "content.manage", ready: true },
      { key: "gallery", href: "/console/gallery", label: "Gallery", icon: "gallery", permission: "content.manage", ready: true },
    ],
  },
  {
    label: "System",
    items: [
      { key: "push", href: "/console/push", label: "Notifications", icon: "bell", permission: "push.send", ready: true },
      { key: "settings", href: "/console/settings", label: "Site details", icon: "settings", permission: "site.manage", ready: true },
      { key: "staff", href: "/console/staff", label: "Staff", icon: "staff", permission: "staff.manage", ready: true },
    ],
  },
];

/** The groups a role can see, with empty groups dropped. */
export function groupsFor(role: Role): ConsoleGroup[] {
  return CONSOLE_GROUPS.map((group) => ({ ...group, items: group.items.filter((m) => !m.permission || can(role, m.permission)) })).filter(
    (group) => group.items.length > 0,
  );
}
