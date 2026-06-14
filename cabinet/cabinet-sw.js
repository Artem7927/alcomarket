// ============================================================
//  AlcoMarket — Service Worker кабинета
//  PWA + пуши + звук открытой странице + счётчик на иконке.
//  ВАЖНО: при изменении файла меняй CACHE — иначе старый
//  SW застрянет в кэше.
// ============================================================

const CACHE = 'cabinet-v15';
const APP_SHELL = [
  './',
  './store-cabinet.html',
  './cabinet-manifest.json',
  './cabinet-icon-192.png',
  './cabinet-icon-512.png'
];

// — Установка: кладём оболочку в кэш, активируемся сразу —
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

// — Активация: чистим старые кэши, берём контроль —
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// — Fetch: рабочий обработчик (не пустышка), как у витрины —
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;            // заказы/сохранения — только сеть

  const url = new URL(req.url);

  // Навигация: сеть, при офлайне — кэш оболочки кабинета
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./store-cabinet.html')));
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

  // Внешние ресурсы (шрифты, API GET): сеть, при сбое — кэш если есть
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});

// ── Счётчик непрочитанных заказов (для бейджа на иконке) ──
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cabinet-badge', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
async function getCount() {
  try {
    const db = await idbOpen();
    return await new Promise((res) => {
      const r = db.transaction('kv', 'readonly').objectStore('kv').get('unread');
      r.onsuccess = () => res(r.result || 0);
      r.onerror   = () => res(0);
    });
  } catch (e) { return 0; }
}
async function setCount(n) {
  try {
    const db = await idbOpen();
    await new Promise((res) => {
      const r = db.transaction('kv', 'readwrite').objectStore('kv').put(n, 'unread');
      r.onsuccess = () => res();
      r.onerror   = () => res();
    });
  } catch (e) {}
}
async function applyBadge(n) {
  try {
    if (self.navigator && self.navigator.setAppBadge) {
      if (n > 0) await self.navigator.setAppBadge(n);
      else       await self.navigator.clearAppBadge();
    }
  } catch (e) {}
}

// — Push: уведомление + бейдж + сигнал открытой странице —
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}

  const title = data.title || '🛒 Новый заказ';
  const options = {
    body: data.body || 'Открой кабинет, чтобы принять заказ',
    icon: './cabinet-icon-192.png',
    badge: './cabinet-icon-192.png',
    vibrate: [300, 150, 300, 150, 300],
    requireInteraction: true,
    tag: data.orderId || 'new-order',
    renotify: true,
    data: { url: data.url || './store-cabinet.html' }
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);

    // +1 к счётчику на иконке приложения
    const n = (await getCount()) + 1;
    await setCount(n);
    await applyBadge(n);

    // разбудить открытые вкладки кабинета — пусть пикнут сами
    // (на переднем плане ОС глушит звук пуша)
    const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clientsArr) {
      c.postMessage({ type: 'new-order', data });
    }
  })());
});

// — Клик по уведомлению: открыть/сфокусировать кабинет + сбросить бейдж —
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './store-cabinet.html';
  event.waitUntil((async () => {
    await setCount(0);
    await applyBadge(0);
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if (client.url.includes('store-cabinet') && 'focus' in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});

// — Сообщение от страницы: владелец смотрит кабинет —
// На Android значок на иконке берётся из активных уведомлений,
// поэтому гасим их (плюс сбрасываем setAppBadge для десктопа).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'clear-badge') {
    event.waitUntil((async () => {
      await setCount(0);
      await applyBadge(0);
      const ns = await self.registration.getNotifications();
      ns.forEach((n) => n.close());
    })());
  }
});
