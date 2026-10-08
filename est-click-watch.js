// est-click-watch.js — 견적서 앱: 저장 버튼 "눌림 관측" (2026-10-07 신규)
// ══════════════════════════════════════════════════
// 선혜님 - 10/7 17:30경 김성은님 견적을 저장했는데 서버에 요청이 한 건도 없었음(17:29 김나진님 저장은 성공, 같은 시각 대시보드는 정상 통신).
// 서버 기록만으로는 "저장 버튼이 눌렸는지, 무엇이 가렸는지, 버튼이 잠겨 있었는지, 탭이 멈췄는지, 로그인 덮개가 떴는지"를 가릴 수 없었다.
// 이 파일은 그 증거를 앱이 스스로 남긴다. 저장 동작은 바꾸지 않는다(모든 코드는 오류를 삼키고, 클릭을 막거나 바꾸지 않는다).
//
//  - 저장 버튼 영역을 누른 pointerdown을 화면 전체에서(캡처 단계) 지켜본다 - 비활성 버튼은 click이 오지 않아도 pointerdown은 오므로 "눌렀는데 잠겨 있었다"를 잡는다.
//    (시험: 정상=대상이 버튼+click까지 옴 / 비활성=pointerdown만 / 덮임=대상이 덮은 요소)
//  - 기기(localStorage)에 순환 기록(최대 200건)을 "먼저" 쓰고, 서버(save_receipts, kind=obs)에는 나중에 보낸다 - 서버로 못 가는 상황의 증거가 같이 막히지 않도록.
//  - 눌렀는데 일정 시간 안에 "저장 시작"이 없으면 press-no-start를 기록하고, 켜져 있으면(feature_flags.obs_banner) 화면 배너로 알린다(원인 불문 경보).
//  - 로그인 덮개(showReloginPrompt) 표시, 탭 숨김/복귀/폐기 여부를 기록한다(폭주 방지 상한 있음).
//  - 개인정보: 입력칸의 값은 절대 기록하지 않는다(id/태그/좌표/상태만).
//  - 끄기 스위치: app_settings.feature_flags.obs_record.enabled === false 이거나 localStorage.dah_obs_off === '1' 이면 아무것도 하지 않는다.
// ══════════════════════════════════════════════════
(function () {
  'use strict';
  var RING_KEY = 'dah_obs_ring', SEQ_KEY = 'dah_obs_seq', SENT_KEY = 'dah_obs_sent';
  var RING_MAX = 200, TAB_MAX = 25, NO_START_MS = 1500, RECENT_START_MS = 15000;
  var enabled = true, bannerOn = false;
  var memRing = [];                 // 기기 저장공간 쓰기가 실패해도 이 메모리 기록은 남는다
  var lastStartAt = 0, lastPressAt = 0, tabCount = 0, flushTimer = null, flushing = false;
  var deviceId = null;

  function safe(fn) { try { return fn(); } catch (e) { return undefined; } }
  function lsGet(k) { return safe(function () { return localStorage.getItem(k); }); }
  function lsSet(k, v) { return safe(function () { localStorage.setItem(k, v); return true; }); }

  function off() { return lsGet('dah_obs_off') === '1' || !enabled; }

  function nextSeq() {
    var n = parseInt(lsGet(SEQ_KEY) || '0', 10) || 0; n++;
    lsSet(SEQ_KEY, String(n)); return n;
  }
  function loadRing() { var r = safe(function () { return JSON.parse(lsGet(RING_KEY) || '[]'); }); return Array.isArray(r) ? r : memRing.slice(); }

  // 기록 한 건 추가(기기에 먼저). k=종류, d=내용(값 없음).
  function record(k, d) {
    safe(function () {
      if (off()) return;
      var e = { seq: nextSeq(), t: Date.now(), k: k, d: d || {} };
      memRing.push(e); if (memRing.length > RING_MAX) memRing = memRing.slice(-RING_MAX);
      var r = loadRing(); r.push(e); if (r.length > RING_MAX) r = r.slice(-RING_MAX);
      lsSet(RING_KEY, JSON.stringify(r));
      scheduleFlush(false);
    });
  }
  window.estObsRecord = record;

  function tokenLeftSec() {
    return safe(function () { var s = JSON.parse(lsGet('dah_auth_session') || 'null'); return s && s.expires_at ? Math.round((s.expires_at - Date.now()) / 1000) : null; });
  }
  function desc(el) {
    if (!el) return null;
    return (el.id ? el.id : (String(el.className || '').split(/\s+/)[0] || '')) || el.tagName || null;
  }

  // ── 저장 버튼 눌림 관측 ──
  function onPointerDown(ev) {
    safe(function () {
      if (off()) return;
      var btn = /** @type {HTMLButtonElement|null} */ (document.getElementById('btn-save-estimate')); if (!btn) return;
      var r = btn.getBoundingClientRect();
      var inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (!inside) return;                                         // 저장 버튼 영역을 누른 것만 기록(다른 곳 클릭은 관심 없음)
      var tgt = ev.target;
      var covered = !(tgt === btn || (btn.contains && btn.contains(tgt)));
      lastPressAt = Date.now();
      record('save-press', { target: desc(tgt), covered: covered, disabled: !!btn.disabled, title: String(btn.title || '').slice(0, 40), online: navigator.onLine, tokenLeftSec: tokenLeftSec(), visible: document.visibilityState, focus: safe(function () { return document.hasFocus(); }) });
      var pressAt = lastPressAt;
      var btnDisabledNow = !!btn.disabled;
      setTimeout(function () { checkNoStart(pressAt, covered, btnDisabledNow); }, NO_START_MS);
    });
  }
  // 눌렀는데 저장이 시작되지 않았나? (방금 저장이 시작됐거나 진행 중이면 정상이므로 건너뜀)
  function checkNoStart(pressAt, covered, disabled) {
    safe(function () {
      if (off()) return;
      if (lastStartAt >= pressAt) return;                          // 눌린 뒤 저장이 시작됨 → 정상
      if (Date.now() - lastStartAt < RECENT_START_MS && lastStartAt > 0) return; // 직전에 저장이 시작/진행 중이던 중복 클릭
      record('press-no-start', { covered: covered, disabled: disabled, waitedMs: NO_START_MS });
      if (bannerOn) showBanner(covered ? '저장 버튼이 다른 화면에 가려져 있어요' : (disabled ? '저장 버튼이 잠겨 있어요(잠시 후 다시 눌러주세요)' : '저장이 시작되지 않았어요'));
    });
  }
  function showBanner(why) {
    safe(function () {
      var el = document.getElementById('obs-no-start-banner');
      if (!el) {
        el = document.createElement('div'); el.id = 'obs-no-start-banner';
        el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483000;background:#C0392B;color:#fff;padding:10px 14px;font-size:13px;font-weight:700;text-align:center;';
        document.body.appendChild(el);
      }
      el.textContent = '⚠️ 저장이 확인되지 않았어요 — ' + why + '. 내용이 서버에 아직 없을 수 있어요(화면을 닫지 마세요).';
      el.onclick = function () { el.parentNode && el.parentNode.removeChild(el); };
    });
  }

  // ── 저장 시작 감지: 기존 영수증 함수 호출을 감싼다(저장 코드는 건드리지 않음) ──
  function wrapReceipt() {
    safe(function () {
      var w = /** @type {any} */ (window);
      if (typeof w.estSendReceipt !== 'function' || w.estSendReceipt.__obsWrapped) return;
      var orig = w.estSendReceipt;
      var wrapped = function (kind, outcome) {
        safe(function () { if (kind === 'save' && outcome === 'start') { lastStartAt = Date.now(); record('save-start', {}); } });
        return orig.apply(this, arguments);
      };
      wrapped.__obsWrapped = true; w.estSendReceipt = wrapped;
      // est-save.js는 estSendReceipt를 전역 함수 이름으로 부르므로, 선언된 함수 바인딩도 같이 바꾼다
      safe(function () { (0, eval)('estSendReceipt = window.estSendReceipt'); });
    });
  }
  function wrapRelogin() {
    safe(function () {
      var w = /** @type {any} */ (window);
      if (typeof w.showReloginPrompt !== 'function' || w.showReloginPrompt.__obsWrapped) return;
      var orig = w.showReloginPrompt;
      var wrapped = function () { safe(function () { record('auth-gate-shown', { tokenLeftSec: tokenLeftSec(), online: navigator.onLine }); }); return orig.apply(this, arguments); };
      wrapped.__obsWrapped = true; w.showReloginPrompt = wrapped;
    });
  }

  // ── 탭 상태(폭주 방지 상한) ──
  function tabEvent(name) {
    safe(function () { if (off() || tabCount >= TAB_MAX) return; tabCount++; record(name, { visible: document.visibilityState, online: navigator.onLine }); });
  }

  // ── 서버 전송: 로그인 갱신 후, 보낸 번호 이후만, 한 번만 ──
  function scheduleFlush(immediate) {
    safe(function () {
      if (off()) return;
      if (flushTimer) { if (!immediate) return; clearTimeout(flushTimer); }
      flushTimer = setTimeout(function () { flushTimer = null; flush(false); }, immediate ? 50 : 20000);
    });
  }
  function flush(force) {
    safe(function () {
      if (off() || flushing) return;
      if (!force && !navigator.onLine) return;
      var sent = parseInt(lsGet(SENT_KEY) || '0', 10) || 0;
      var all = loadRing().filter(function (e) { return e.seq > sent; });
      if (all.length === 0) return;
      var batch = all.slice(0, 50), lastSeq = batch[batch.length - 1].seq, firstSeq = batch[0].seq;
      flushing = true;
      var done = function () { flushing = false; };
      var send = function () {
        safe(function () {
          if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_KEY === 'undefined') { done(); return; }
          var sess = safe(function () { return JSON.parse(lsGet('dah_auth_session') || 'null'); });
          var xhr = new XMLHttpRequest(); xhr.open('POST', SUPABASE_URL + '/rest/v1/save_receipts', true);
          xhr.setRequestHeader('apikey', SUPABASE_KEY);
          xhr.setRequestHeader('Authorization', 'Bearer ' + ((typeof getAuthToken === 'function' && getAuthToken()) || SUPABASE_KEY));
          xhr.setRequestHeader('Content-Type', 'application/json'); xhr.setRequestHeader('Prefer', 'return=minimal'); xhr.timeout = 10000;
          xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
              lsSet(SENT_KEY, String(lastSeq)); done();
              if (all.length > batch.length) scheduleFlush(true);
            } else done();
          };
          xhr.onerror = done; xhr.ontimeout = done;
          xhr.send(JSON.stringify({ kind: 'obs', outcome: null, customer_name: null, estimate_id: null,
            app_version: safe(function () { var s = /** @type {HTMLScriptElement|null} */ (document.querySelector('script[src*="est-click-watch.js"]')); return s && s.src.indexOf('?v=') !== -1 ? s.src.split('?v=')[1] : null; }),
            user_email: (sess && sess.email) || null,
            device: String(navigator.userAgent || '').slice(0, 120) + ' | ' + screen.width + 'x' + screen.height + ' | online=' + navigator.onLine,
            detail: { batch_id: (deviceId || 'dev') + ':' + firstSeq + '-' + lastSeq, entries: batch } }));
        });
      };
      if (typeof refreshAuthSessionIfNeeded === 'function') refreshAuthSessionIfNeeded(function () { send(); }); else send();
    });
  }
  window.estObsFlush = function (force) { flush(!!force); };

  // ── 켜기/끄기 스위치(서버 설정) ──
  function loadFlags() {
    safe(function () {
      if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_KEY === 'undefined') return;
      var xhr = new XMLHttpRequest(); xhr.open('GET', SUPABASE_URL + '/rest/v1/app_settings?key=eq.feature_flags&select=value', true);
      xhr.setRequestHeader('apikey', SUPABASE_KEY);
      xhr.setRequestHeader('Authorization', 'Bearer ' + ((typeof getAuthToken === 'function' && getAuthToken()) || SUPABASE_KEY));
      xhr.timeout = 8000;
      xhr.onload = function () {
        safe(function () {
          if (xhr.status < 200 || xhr.status >= 300) return;
          var rows = JSON.parse(xhr.responseText); var v = rows && rows[0] && rows[0].value || {};
          if (v.obs_record && v.obs_record.enabled === false) { enabled = false; }
          var b = v.obs_banner;
          if (b && b.enabled === true) bannerOn = true;
          else if (b && Array.isArray(b.emails)) { var me = safe(function () { return (JSON.parse(lsGet('dah_auth_session') || 'null') || {}).email; }); if (me && b.emails.indexOf(me) !== -1) bannerOn = true; }
        });
      };
      xhr.send();
    });
  }

  // ── 시작 ──
  function init() {
    safe(function () {
      deviceId = lsGet('dah_obs_device') || ('d' + Math.random().toString(36).slice(2, 8)); lsSet('dah_obs_device', deviceId);
      document.addEventListener('pointerdown', onPointerDown, true);             // 캡처 단계: 덮개·잠금과 무관하게 가장 먼저 받는다
      document.addEventListener('visibilitychange', function () { tabEvent(document.visibilityState === 'hidden' ? 'tab-hidden' : 'tab-visible'); });
      document.addEventListener('freeze', function () { tabEvent('tab-freeze'); });
      document.addEventListener('resume', function () { tabEvent('tab-resume'); });
      window.addEventListener('online', function () { record('net-online', {}); scheduleFlush(true); });
      window.addEventListener('offline', function () { record('net-offline', {}); });
      window.addEventListener('pagehide', function () { flush(true); });
      if (document.wasDiscarded) record('tab-was-discarded', {});             // Chrome/Edge: 이 화면은 브라우저가 폐기했다가 다시 불러온 것
      // 로그인 덮개가 처음부터 떠 있는 경우
      safe(function () { var g = document.getElementById('est-auth-gate'); if (g && getComputedStyle(g).display !== 'none') record('auth-gate-visible', { at: 'load' }); });
      wrapReceipt(); wrapRelogin();
      loadFlags();
      scheduleFlush(false);
    });
  }
  // 다른 스크립트가 모두 로드된 뒤 연결(est-save.js의 estSendReceipt, 인라인의 showReloginPrompt가 필요)
  if (document.readyState === 'complete') setTimeout(init, 0); else window.addEventListener('load', function () { setTimeout(init, 0); });
})();
