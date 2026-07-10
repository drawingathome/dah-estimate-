/* DAH Service Worker — 자가 제거 (self-destruct)
   서비스워커 캐싱이 배포 후 최신 버전 반영을 지연시키는 근본 원인이었음이 확인되어
   서비스워커 기능 자체를 완전히 폐기함. 이 파일은 기존에 설치된 서비스워커를
   찾아 스스로 등록 해제하고, 모든 캐시를 삭제하고, 열려있는 탭을 새로고침하는
   역할만 수행함. 신규 방문자에게는 애초에 등록되지 않음 (dah-dashboard.html 참고). */

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys()
      .then(function(keys) { return Promise.all(keys.map(function(k) { return caches.delete(k); })); })
      .then(function() { return self.registration.unregister(); })
      .then(function() { return self.clients.matchAll({ type: 'window' }); })
      .then(function(clients) {
        clients.forEach(function(client) { client.navigate(client.url); });
      })
  );
});

self.addEventListener('fetch', function(e) {
  // 아무것도 가로채지 않고 그대로 네트워크로 통과시킴
});
