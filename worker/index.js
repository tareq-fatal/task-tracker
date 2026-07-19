// Custom service-worker code merged into the generated PWA worker by
// @ducanh2912/next-pwa. Handles Web Push notifications.

self.addEventListener("push", (event) => {
  let data = { title: "Task Tracker", body: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

// Browsers may rotate/expire a push subscription at any time. Re-subscribe
// with the same VAPID key and tell the server, so pushes keep arriving even
// though the app was never reopened.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const options = event.oldSubscription?.options ?? {
          userVisibleOnly: true,
        };
        const sub = await self.registration.pushManager.subscribe(options);
        await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub),
        });
      } catch (e) {
        /* best-effort — next app open re-syncs via PushBootstrap */
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
