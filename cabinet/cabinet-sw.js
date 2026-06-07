// ============================================================
//  AlcoMarket — Service Worker кабинета
//  Шаг 1: делает кабинет устанавливаемым приложением (PWA).
//  Обработчики push/notificationclick уже на месте — на шаге 2
//  мы подключим подписку и отправку с Railway, и они оживут.
//  ВАЖНО: при любом изменении этого файла меняй CACHE_VERSION,
//  иначе старый SW застрянет в кэше (как с видео).
// ============================================================

const CACHE_VERSION = 'cab-v2';

// — Установка: активируем новый SW сразу, без ожидания —
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// — Активация: берём контроль над открытыми вкладками —
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// — Fetch: простой passthrough. Нужен, чтобы Chrome считал
//   кабинет устанавливаемым. Ничего чужого не ломает. —
self.addEventListener('fetch', (event) => {
  // Браузеру нужен fetch-обработчик с respondWith, иначе «Установить» не предложит.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./store-cabinet.html'))
    );
    return;
  }
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

// — Push: сюда прилетит уведомление о новом заказе (шаг 2) —
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}

  const title = data.title || '🛒 Новый заказ';
  const options = {
    body: data.body || 'Открой кабинет, чтобы принять заказ',
    icon: './cabinet-icon-192.png',
    badge: './cabinet-icon-192.png',
    vibrate: [300, 150, 300, 150, 300],   // ощутимая вибрация
    requireInteraction: true,             // не гаснет само — висит, пока не нажмёшь
    tag: data.orderId || 'new-order',     // одинаковые заказы не плодят дубли
    renotify: true,                       // но новый заказ снова звенит
    data: { url: data.url || './store-cabinet.html' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// — Клик по уведомлению: открыть/сфокусировать кабинет —
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './store-cabinet.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('store-cabinet') && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
