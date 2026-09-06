// ══════════════════════════════════════════════════════════
// DAH 공용 — 스테이징 환경 쓰기 차단 안전장치
// 2026-09-06(선혜님 지적 — "전문업체면 이정도 하면 된거 같아??"로 발견,
// "당장 고치자"로 즉시 수정): GitHub Pages 스테이징이 실제 프로덕션과
// 완전히 같은 Supabase 데이터베이스(SUPABASE_URL)를 그대로 쓰고 있었음
// - 스테이징에서 "저장" 버튼을 누르면 진짜 고객 데이터가 있는 실제
// DB에 그대로 써지는 심각한 위험이 있었음(오늘 아침 발견했던 "회귀
// 테스트가 실제 데이터를 오염시키던 문제"와 정확히 같은 종류의 위험).
//
// 별도 스테이징 전용 데이터베이스를 새로 만드는 대신(스테이징에 데이터가
// 하나도 없으면 오히려 실사용과 다른 화면이 되어 테스트 의미가 떨어짐),
// "알려진 실제 서비스 도메인(*.vercel.app)이 아니면 Supabase에 대한
// 쓰기(POST/PATCH/PUT/DELETE) 요청 자체를 원천 차단"하는 방식을 택함 -
// 화면을 보고 읽는 것(GET)은 실제 데이터 그대로 정상적으로 보이면서도,
// 실수로 저장/삭제를 눌러도 절대 실제 DB에 반영되지 않음.
//
// 이 스크립트는 각 앱의 모든 저장 로직(sbXHR, sbSyncSetting, saveEstimate,
// saveCustomerToDb 등)보다 반드시 먼저 로드되어야 함 - XMLHttpRequest
// 자체를 감시하는 낮은 레벨의 방어라, 개별 저장 함수를 하나하나 고칠
// 필요 없이 전체를 한 번에 안전하게 막아줌.
// ══════════════════════════════════════════════════════════

(function () {
  // 2026-09-06: localhost/127.0.0.1(로컬 개발·자동화 회귀테스트 환경)도
  // 안전한 도메인으로 취급 - 처음엔 *.vercel.app만 예외로 뒀다가, 실제로
  // 전체 회귀테스트를 돌려보니 테스트 자체가 localhost에서 실행되는데
  // 이걸 스테이징으로 오판해서 저장/등록 관련 테스트가 대거 실패하는
  // 것을 발견함(재현 검증 과정에서 스스로 발견) - 즉시 화이트리스트 확장.
  var isSafeWriteDomain = /\.vercel\.app$/.test(window.location.hostname)
    || window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1';
  if (isSafeWriteDomain) return; // 실제 서비스/로컬 개발환경에서는 이 안전장치가 전혀 개입하지 않음

  // 2026-09-06(선혜님 지적 - "문제는 없니??"로 발견): 처음엔 XMLHttpRequest만
  // 감시하고 supabase.co만 차단 대상으로 삼았는데, 견적서/발주서 문서를
  // 구글 드라이브에 저장하는 경로(saveDocumentToDrive/syncCustomerToSheet,
  // est-utils.js)는 XMLHttpRequest가 아니라 fetch()를 쓰고, 대상 도메인도
  // script.google.com(Apps Script 웹훅)이라 완전히 안 걸리고 있었음 -
  // 스테이징에서 견적서를 저장하면 DB는 안전한데 실제 구글 드라이브엔
  // 진짜 문서가 만들어지는 구멍이었음(오늘 아침 발견했던 "테스트가 실제
  // 구글드라이브를 오염시키던 문제"가 재발할 수 있는 경로). fetch()도
  // 함께 감시하고, 차단 대상 도메인에 script.google.com도 추가.
  var BLOCKED_WRITE_DOMAINS = ['supabase.co', 'script.google.com'];
  function isBlockedWriteUrl(url) {
    return BLOCKED_WRITE_DOMAINS.some(function (d) { return url.indexOf(d) !== -1; });
  }

  var WRITE_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._dahMethod = (method || '').toUpperCase();
    this._dahUrl = url || '';
    return origOpen.apply(this, arguments);
  };

  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    var method = this._dahMethod || '';
    var url = this._dahUrl || '';
    var isBlockedWrite = isBlockedWriteUrl(url) && WRITE_METHODS.indexOf(method) !== -1;
    if (isBlockedWrite) {
      console.warn('[스테이징 안전장치] 실제 쓰기 요청을 차단했습니다(XHR):', method, url);
      var self = this;
      setTimeout(function () {
        try {
          Object.defineProperty(self, 'status', { value: 403, configurable: true });
          Object.defineProperty(self, 'readyState', { value: 4, configurable: true });
          Object.defineProperty(self, 'responseText', {
            value: JSON.stringify({ message: '스테이징 환경에서는 저장·수정·삭제가 차단됩니다(실제 데이터 보호)' }),
            configurable: true
          });
        } catch (e) { /* 일부 구형 브라우저는 재정의가 안 될 수 있음 - 그래도 send 자체를 안 하니 안전함 */ }
        if (typeof self.onload === 'function') self.onload();
        if (typeof self.onreadystatechange === 'function') self.onreadystatechange();
        if (typeof self.dispatchEvent === 'function') { try { self.dispatchEvent(new Event('load')); } catch (e) {} }
      }, 30);
      return; // 실제 네트워크 전송(origSend)을 호출하지 않음 - 이게 핵심 차단 지점
    }
    return origSend.apply(this, arguments);
  };

  // fetch()로 이루어지는 쓰기(구글 드라이브 저장 등)도 동일하게 차단.
  if (window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      var method = ((init && init.method) || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
      if (isBlockedWriteUrl(url) && WRITE_METHODS.indexOf(method) !== -1) {
        console.warn('[스테이징 안전장치] 실제 쓰기 요청을 차단했습니다(fetch):', method, url);
        return Promise.resolve(new Response(JSON.stringify({ message: '스테이징 환경에서는 저장·수정·삭제가 차단됩니다(실제 데이터 보호)' }), { status: 403 }));
      }
      return origFetch.apply(this, arguments);
    };
  }

  // 화면에도 스테이징임을 명확히 표시(사용자가 착각하지 않도록)
  window.addEventListener('DOMContentLoaded', function () {
    var badge = document.createElement('div');
    badge.textContent = '🧪 스테이징(읽기 전용) — 저장/수정/삭제 불가';
    badge.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:#B8860B;color:#fff;text-align:center;font-size:12px;font-weight:700;padding:4px 8px;pointer-events:none';
    document.body.appendChild(badge);
  });
})();
