// Service worker: guarda el juego para que funcione sin internet.
const CACHE = 'ultima-noche-v8';

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './assets/modelos/zombi.glb']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Primero red (para tener la última versión); si no hay, usa la copia guardada.
self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  evento.respondWith(
    fetch(evento.request)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(evento.request, copia));
        return res;
      })
      .catch(() => caches.match(evento.request))
  );
});
