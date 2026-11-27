/*
 * Kavery service worker. Deliberately small:
 *   - shows push notifications (with a poster, where the platform draws one)
 *     and opens the right page when one is tapped
 *   - serves an offline page when a navigation fails
 * It does NOT cache pages or API responses. Scores and registers must never be
 * served stale, and a cached admin page is how people end up acting on old data.
 */
const CACHE = "kavery-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "" };
  }
  const sameSite = (value) => typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: data.tag || data.topic || "kavery",
    data: { url: sameSite(data.url) ? data.url : "/" },
  };
  // Android and desktop Chrome/Edge show this as a large picture under the text
  // (cropped to a wide strip). iPhones ignore it; the notice page it opens shows
  // the whole poster either way.
  if (sameSite(data.image)) options.image = data.image;
  event.waitUntil(self.registration.showNotification(data.title || "Kavery Sports Club", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => client.url === url);
      if (open) return open.focus();
      return self.clients.openWindow(url);
    })(),
  );
});
