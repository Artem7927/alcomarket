// AlcoMarket service worker
const CACHE = 'alcomarket-v7';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './alkobarometr.html',
  './human_female.png','./human_female_mask.png','./human_male.png','./human_male_mask.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Заказы, сохранение товаров и т.п. (POST/PUT/PATCH/DELETE) — всегда только сеть, не кэшируем
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Навигация (открытие приложения): сеть, при офлайне — кэш оболочки
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // Свои статические файлы: кэш, потом сеть
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => cached)
      )
    );
    return;
  }

  // Внешние ресурсы (CDN, шрифты, API GET, карты): сеть, при сбое — кэш если есть
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});
