"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BellRing, Check, Download } from "lucide-react";
import { PUBLIC_PUSH_TOPICS, type PushTopic } from "@/lib/push-topics";

type Labels = Record<
  "install" | "installed" | "enable" | "update" | "disable" | "on" | "blocked" | "unsupported" | "iosHint" | "installHint" | "failed" | "topicsLabel",
  string
> & { topics: Record<(typeof PUBLIC_PUSH_TOPICS)[number], string> };

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const TOPICS_KEY = "kavery.push.topics";

function toKey(base64url: string) {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function readTopics(): PushTopic[] {
  try {
    const saved = JSON.parse(localStorage.getItem(TOPICS_KEY) ?? "null");
    if (Array.isArray(saved)) return saved.filter((t): t is PushTopic => (PUBLIC_PUSH_TOPICS as readonly string[]).includes(t));
  } catch {}
  return [...PUBLIC_PUSH_TOPICS];
}

/** Facts about this browser that never change while the page is open. */
type Device = { ready: boolean; ios: boolean; standalone: boolean; pushSupported: boolean; permission: NotificationPermission; savedTopics: PushTopic[] };
const SERVER_DEVICE: Device = { ready: false, ios: false, standalone: false, pushSupported: false, permission: "default", savedTopics: [...PUBLIC_PUSH_TOPICS] };
let clientDevice: Device | null = null;

function readDevice(): Device {
  if (clientDevice) return clientDevice;
  const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  clientDevice = {
    ready: true,
    ios: /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    standalone: window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    pushSupported,
    permission: pushSupported ? Notification.permission : "default",
    savedTopics: readTopics(),
  };
  return clientDevice;
}
const subscribeNever = () => () => {};

/**
 * Install + notifications in one place.
 *
 * iOS only delivers web push to a site that was added to the Home Screen and
 * opened from there, so on an iPhone in a browser tab this shows the install
 * steps instead of a subscribe button that could never work.
 */
export function AppPanel({ vapidPublicKey, locale, labels }: { vapidPublicKey: string | null; locale: string; labels: Labels }) {
  // The server snapshot renders first, so hydration matches; the real device follows.
  const device = useSyncExternalStore(subscribeNever, readDevice, () => SERVER_DEVICE);
  const { ready, ios: isIos, pushSupported } = device;

  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [showInstallHint, setShowInstallHint] = useState(false);
  const [permissionNow, setPermission] = useState<NotificationPermission | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [chosenTopics, setTopics] = useState<PushTopic[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const standalone = device.standalone || installed;
  const permission = permissionNow ?? device.permission;
  const topics = chosenTopics ?? device.savedTopics;

  useEffect(() => {
    if (pushSupported) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setSubscribed(!!sub))
        .catch(() => {});
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [pushSupported]);

  async function install() {
    if (!prompt) return setShowInstallHint(true);
    await prompt.prompt();
    if ((await prompt.userChoice).outcome === "accepted") setInstalled(true);
    setPrompt(null);
  }

  async function subscribe() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setError(false);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(vapidPublicKey) }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), topics, locale }),
      });
      if (!res.ok) throw new Error("subscribe failed");
      try {
        localStorage.setItem(TOPICS_KEY, JSON.stringify(topics));
      } catch {}
      setSubscribed(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    setError(false);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (topic: PushTopic) => setTopics(topics.includes(topic) ? topics.filter((t) => t !== topic) : [...topics, topic]);
  const needsIosInstall = isIos && !standalone;
  const canSubscribe = ready && pushSupported && !!vapidPublicKey && !needsIosInstall && permission !== "denied";

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <div>
        {standalone ? (
          <p className="inline-flex items-center gap-2 text-lg font-semibold">
            <Check aria-hidden className="h-5 w-5" /> {labels.installed}
          </p>
        ) : (
          <button type="button" onClick={install} className="btn btn-accent">
            <span>
              <Download aria-hidden className="h-5 w-5" /> {labels.install}
            </span>
          </button>
        )}
        {!standalone && (isIos || showInstallHint) && <p className="mt-5 max-w-md text-[0.9375rem] leading-relaxed opacity-90">{isIos ? labels.iosHint : labels.installHint}</p>}
      </div>

      <div>
        <fieldset disabled={!canSubscribe || busy}>
          <legend className="eyebrow">{labels.topicsLabel}</legend>
          <div className="mt-4 flex flex-col gap-1">
            {PUBLIC_PUSH_TOPICS.map((topic) => (
              <label key={topic} className="flex min-h-11 cursor-pointer items-center gap-3 text-lg">
                <input type="checkbox" checked={topics.includes(topic)} onChange={() => toggle(topic)} className="h-5 w-5 accent-[var(--accent)]" />
                {labels.topics[topic]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-6 flex flex-wrap items-center gap-5 pl-1">
          {canSubscribe && (
            <button type="button" onClick={subscribe} disabled={busy || topics.length === 0} className="btn bg-fg text-bg">
              <span>
                <BellRing aria-hidden className="h-5 w-5" /> {subscribed ? labels.update : labels.enable}
              </span>
            </button>
          )}
          {canSubscribe && subscribed && (
            <button type="button" onClick={unsubscribe} disabled={busy} className="min-h-11 cursor-pointer px-2 font-semibold underline underline-offset-4">
              {labels.disable}
            </button>
          )}
        </div>

        <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed opacity-90" role="status">
          {error
            ? labels.failed
            : !ready
              ? ""
              : permission === "denied"
                ? labels.blocked
                : needsIosInstall
                  ? ""
                  : !pushSupported || !vapidPublicKey
                    ? labels.unsupported
                    : subscribed
                      ? labels.on
                      : ""}
        </p>
      </div>
    </div>
  );
}
