"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/**
 * Club membership console screens, loaded in the browser only so the QR library
 * behind the membership card stays out of the Worker bundle. Pages import from
 * here, never from the screen files (see components/keda/screens.tsx).
 */
const loading = () => (
  <div className="flex justify-center p-12">
    <Loader2 className="animate-spin text-muted-foreground" size={32} aria-label="Loading" />
  </div>
);

export const MembersScreen = dynamic(() => import("./members"), { ssr: false, loading });
export const MemberDetailScreen = dynamic(() => import("./member-detail"), { ssr: false, loading });
export const MemberNewScreen = dynamic(() => import("./member-new"), { ssr: false, loading });
export const MembershipSettingsScreen = dynamic(() => import("./membership-settings"), { ssr: false, loading });
