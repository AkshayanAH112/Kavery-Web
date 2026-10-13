"use client";

import { useState, type FormEvent } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { ROLES, ROLE_LABELS, ROLE_SUMMARIES, type Role } from "@/lib/auth/roles";
import { Badge, Button, Card, Field, Note, fieldClass } from "./ui";

type Staff = { id: string; name: string; email: string; role: string; isActive: boolean; lastLoginAt: number | null; createdAt: number };
type Message = { tone: "error" | "success"; text: string };

const formatDate = (ms: number | null) =>
  ms ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(ms) : "Never";

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => ({}))) as { error?: string; staff?: Staff };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}

export function StaffManager({ initial, currentUserId }: { initial: Staff[]; currentUserId: string }) {
  const [staff, setStaff] = useState(initial);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [newRole, setNewRole] = useState<Role>("attendance");
  const [resetFor, setResetFor] = useState<string | null>(null);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ tone: "success", text: await action() });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const patch = (id: string, changes: Record<string, unknown>, done: string) =>
    run(async () => {
      const data = await call(`/api/staff/${id}`, "PATCH", changes);
      // API dates arrive as ISO strings; keep the numeric ones this list already holds.
      setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...changes, name: data.staff?.name ?? s.name } : s)) as Staff[]);
      return done;
    });

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    run(async () => {
      const data = await call("/api/staff", "POST", { name: form.get("name"), email: form.get("email"), role: newRole, password: form.get("password") });
      if (data.staff) setStaff((prev) => [...prev, { ...data.staff!, lastLoginAt: null, createdAt: Date.now() }].sort((a, b) => a.name.localeCompare(b.name)));
      formEl.reset();
      return "Account created. Give them the email and password in person.";
    });
  }

  function resetPassword(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    run(async () => {
      await call(`/api/staff/${id}`, "PATCH", { password });
      setResetFor(null);
      return "Password changed.";
    });
  }

  const remove = (person: Staff) =>
    run(async () => {
      await call(`/api/staff/${person.id}`, "DELETE");
      setStaff((prev) => prev.filter((s) => s.id !== person.id));
      return `${person.name}'s account was deleted.`;
    });

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        {message && <Note tone={message.tone}>{message.text}</Note>}

        <ul className="space-y-3">
          {staff.map((person) => {
            const isSelf = person.id === currentUserId;
            return (
              <li key={person.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                        {person.name}
                        {isSelf && <Badge tone="brand">You</Badge>}
                        {!person.isActive && <Badge tone="warn">Deactivated</Badge>}
                      </p>
                      <p className="break-all text-muted-foreground">{person.email}</p>
                      <p className="mt-1 text-sm text-muted-foreground">Last signed in: {formatDate(person.lastLoginAt)}</p>
                    </div>
                    <label className="w-full sm:w-56">
                      <span className="sr-only">Role for {person.name}</span>
                      <select
                        className={fieldClass}
                        value={person.role}
                        disabled={busy}
                        onChange={(e) => patch(person.id, { role: e.target.value }, `${person.name} is now ${ROLE_LABELS[e.target.value as Role]}.`)}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" disabled={busy} onClick={() => setResetFor(resetFor === person.id ? null : person.id)}>
                      {resetFor === person.id ? "Cancel" : "Change password"}
                    </Button>
                    {!isSelf && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => patch(person.id, { isActive: !person.isActive }, person.isActive ? `${person.name} can no longer sign in.` : `${person.name} can sign in again.`)}
                      >
                        {person.isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    )}
                    {!isSelf && !person.isActive && (
                      <Button variant="danger" disabled={busy} onClick={() => remove(person)}>
                        Delete account
                      </Button>
                    )}
                  </div>

                  {resetFor === person.id && (
                    <form onSubmit={(e) => resetPassword(e, person.id)} className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
                      <div className="min-w-56 flex-1">
                        <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
                          <input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required className={fieldClass} />
                        </Field>
                      </div>
                      <Button type="submit" disabled={busy} className="mb-[1.875rem]">
                        Save password
                      </Button>
                    </form>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      </div>

      <Card className="h-fit p-6">
        <h2 className="text-lg font-semibold tracking-tight">Add staff</h2>
        <form onSubmit={create} className="mt-5 space-y-4">
          <Field label="Full name">
            <input name="name" required minLength={2} maxLength={80} autoComplete="off" className={fieldClass} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required autoComplete="off" className={fieldClass} />
          </Field>
          <Field label="Role" hint={ROLE_SUMMARIES[newRole]}>
            <select className={fieldClass} value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Password" hint={`At least ${MIN_PASSWORD_LENGTH} characters. They can ask you to change it later.`}>
            <input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required className={fieldClass} />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            Create account
          </Button>
        </form>
      </Card>
    </div>
  );
}
