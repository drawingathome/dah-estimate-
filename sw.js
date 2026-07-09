/* DAH Service Worker v1.1 */
const CACHE_NAME = 'dah-cache-v2';
const CACHE_URLS = [
  '/dah-dashboard',
  '/dah-estimate',
  '/survey',
  '/logo.png',
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // cache.addAll()은 URL 하나라도 실패하면 전체가 실패하는 구조라,
      // 개별적으로 캐싱해서 하나 실패해도 나머지는 정상 캐싱되게 함
      return Promise.allSettled(
        CACHE_URLS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('SW: 캐싱 실패(무시하고 계속):', url, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var networkFetch = fetch(e.request).then(function(res) {
        if (res && res.status === 200) {
          var resClone = res.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, resClone);
          });
        }
        return res;
      }).catch(function() { return cached; });
      return cached || networkFetch;
    })
  );
});