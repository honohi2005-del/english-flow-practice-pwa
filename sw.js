const CACHE_NAME = "english-flow-practice-v40";
  const AUDIO_CACHE_NAME = "english-flow-practice-audio-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=25",
  "./sentences.js",
    "./vowel-advice.js",
  "./speech-voice.js",
  "./pronunciation-tips.js",
  "./pronunciation-tips-polish.js",
  "./pronunciation-tips-001.js",
  "./pronunciation-tips-002.js",
  "./pronunciation-tips-003.js",
  "./pronunciation-tips-004.js",
  "./pronunciation-tips-005.js",
  "./pronunciation-tips-006.js",
  "./pronunciation-tips-007.js",
  "./pronunciation-tips-008.js",
  "./pronunciation-tips-009.js",
  "./pronunciation-tips-010.js",
  "./pronunciation-tips-011.js",
  "./pronunciation-tips-012.js",
  "./pronunciation-tips-013.js",
  "./pronunciation-tips-014.js",
  "./pronunciation-tips-015.js",
  "./pronunciation-tips-016.js",
  "./pronunciation-tips-017.js",
  "./pronunciation-tips-018.js",
  "./pronunciation-tips-019.js",
  "./pronunciation-tips-020.js",
  "./pronunciation-tips-021.js",
  "./pronunciation-tips-022.js",
  "./pronunciation-tips-023.js",
  "./pronunciation-tips-024.js",
  "./pronunciation-tips-025.js",
  "./pronunciation-tips-026.js",
  "./pronunciation-tips-027.js",
  "./pronunciation-tips-028.js",
  "./pronunciation-tips-029.js",
  "./pronunciation-tips-030.js",
  "./pronunciation-tips-031.js",
  "./pronunciation-tips-032.js",
  "./pronunciation-tips-033.js",
  "./pronunciation-tips-034.js",
  "./pronunciation-tips-035.js",
  "./pronunciation-tips-036.js",
  "./pronunciation-tips-037.js",
  "./pronunciation-tips-038.js",
  "./pronunciation-tips-039.js",
  "./pronunciation-tips-040.js",
  "./pronunciation-tips-041.js",
  "./pronunciation-tips-042.js",
  "./pronunciation-tips-043.js",
  "./pronunciation-tips-044.js",
  "./pronunciation-tips-045.js",
  "./pronunciation-tips-046.js",
  "./pronunciation-tips-047.js",
  "./pronunciation-tips-048.js",
  "./pronunciation-tips-049.js",
  "./pronunciation-tips-050.js",
  "./pronunciation-tips-051.js",
  "./pronunciation-tips-052.js",
  "./pronunciation-tips-053.js",
  "./pronunciation-tips-054.js",
  "./pronunciation-tips-055.js",
  "./pronunciation-tips-056.js",
  "./pronunciation-tips-057.js",
  "./pronunciation-tips-058.js",
  "./pronunciation-tips-059.js",
  "./pronunciation-tips-060.js",
  "./recording-store.js",
  "./google-drive-config.js",
  "./google-drive-sync.js?v=39",
    "./startup.js?v=30",
  "./app.js?v=36",
  "./audio/tts-manifest.json",
  "./site.webmanifest?v=3",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== AUDIO_CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const isAudioRequest = requestUrl.pathname.includes("/audio/tts/")
    && requestUrl.pathname.endsWith(".mp3");
  if (isAudioRequest) {
    // Native audio controls may request byte ranges. Let those requests keep
    // their Range semantics, while caching full-file requests for repeat use.
    if (event.request.headers.has("range")) {
      event.respondWith(fetch(event.request));
    } else {
      event.respondWith(
        caches.open(AUDIO_CACHE_NAME).then((cache) =>
          fetch(event.request)
            .then((response) => {
              if (response && response.ok && response.status === 200) {
                cache.put(event.request, response.clone()).catch(() => {});
              }
              return response;
            })
            .catch(() => cache.match(event.request).then((cached) => cached || Response.error()))
        )
      );
    }
    return;
  }

  const isNavigationRequest = event.request.mode === "navigate"
    || requestUrl.pathname.endsWith("/")
    || requestUrl.pathname.endsWith("/index.html");
  if (isNavigationRequest) {
    event.respondWith(
      fetch(event.request, { cache: "no-cache" })
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put("./index.html", copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then((cached) => cached || caches.match("./index.html"))
            .then((cached) => cached || Response.error())
        )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || !response.ok || response.type !== "basic") return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
