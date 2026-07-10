/* DAH Service Worker v1.2 — 네트워크 우선 방식으로 전환 (캐시우선 방식이 배포 지연처럼 보이는 근본 원인이었음) */
const CACHE_NAME = 'dah-cache-v3';
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
  // 네트워크 우선: 인터넷 연결이 되어있으면 항상 최신 버전을 먼저 시도.
  // 오프라인일 때만 캐시된 버전으로 대체 (예전엔 반대였음 — 캐시가 있으면 무조건 그것부터 보여줘서
  // 배포를 해도 새로고침 한 번으로는 반영이 안 되고 한 박자 늦게 보이는 문제가 있었음)
  e.respondWith(
    fetch(e.request).then(function(res) {
      if (res && res.status === 200) {
        var resClone = res.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, resClone);
        });
      }
      return res;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});