"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Role } from "@/lib/auth/roles";

export type CurrentUser = { name: string; email: string; role: Role; isAdmin: boolean };

const Context = createContext<CurrentUser | null>(null);

/** The signed-in staff member, supplied by the console layout from the server session. */
export function CurrentUserProvider({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return <Context.Provider value={user}>{children}</Context.Provider>;
}

/**
 * For showing or hiding controls only. It is never the access check — every
 * API route re-checks the role itself.
 */
export function useCurrentUser() {
  return { user: useContext(Context), loading: false };
}
