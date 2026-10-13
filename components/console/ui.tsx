import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The console's small shared kit. Token-driven: nothing here names a raw colour. */

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[var(--card-radius)] border border-line bg-surface", className)} {...props} />;
}

/** Title + one line of context, with an optional control on the right. */
export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const buttonStyles = {
  primary: "bg-brand text-on-brand hover:opacity-90",
  secondary: "border border-line bg-surface text-fg hover:bg-muted",
  danger: "border border-line bg-surface text-danger hover:bg-muted",
};

export const buttonClass = (variant: keyof typeof buttonStyles = "primary", className?: string) =>
  cn(
    "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[var(--field-radius)] px-4 text-[0.9375rem] font-semibold transition-[background-color,opacity] duration-150 disabled:cursor-not-allowed disabled:opacity-50",
    buttonStyles[variant],
    className,
  );

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return <button type="button" className={buttonClass(variant, className)} {...props} />;
}

export const fieldClass =
  "block min-h-11 w-full rounded-[var(--field-radius)] border border-line bg-surface px-3 text-base text-fg placeholder:text-muted-foreground focus-visible:outline-offset-0";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-sm text-muted-foreground">{hint}</span>}
    </label>
  );
}

const noteStyles = { error: "border-danger text-danger", success: "border-ok text-ok", info: "border-line text-muted-foreground" };

export function Note({ tone = "info", children }: { tone?: keyof typeof noteStyles; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={cn("rounded-[var(--field-radius)] border-l-4 bg-muted px-4 py-3 text-[0.9375rem] font-medium", noteStyles[tone])}>
      {children}
    </p>
  );
}

const badgeTones = {
  neutral: "bg-muted text-muted-foreground",
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
  brand: "bg-brand-text/10 text-brand-text",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", badgeTones[tone])}>{children}</span>;
}

/** The square icon tile used at the start of list rows and in stat cards. */
export function IconTile({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--field-radius)] border border-line bg-surface", className)}>{children}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--field-radius)] border border-dashed border-line px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}
