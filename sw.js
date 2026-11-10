// Best Guess offline support (version 0.4.0)
const CACHE = "best-guess-0.4.0";
const PREFIX = "best-guess-";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./favicon-32.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function saveCopy(key, res) {
  if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Only this site's own files. Live prices from CoinGecko go straight to the network.
  if (url.origin !== self.location.origin) return;
  // The page itself: newest version when online, the saved copy when not.
  // Only the app page is saved, so opening another page here can't replace it.
  if (req.mode === "navigate") {
    const isApp = /\/(index\.html)?$/.test(url.pathname);
    e.respondWith(
      fetch(req)
        .then((res) => (isApp ? saveCopy("./index.html", res) : res))
        .catch(() => caches.match("./index.html"))
    );
    return;
  }
  // Saved prices: newest when online, the last copy when not
  if (url.pathname.endsWith("/prices.json")) {
    e.respondWith(fetch(req).then((res) => saveCopy("./prices.json", res)).catch(() => caches.match("./prices.json").then((hit) => hit || Response.error())));
    return;
  }
  // Icons and the manifest: saved copy first
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => saveCopy(req, res))));
});
