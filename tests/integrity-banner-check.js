// 홈 "데이터 점검" 카드: 이상 있을 때만 뜨고, 확인함으로 숨겨지고, 조회 실패/이상 없음이면 조용한지 검증
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 50000);
(async () => {
  const server = await startServer(path.resolve(__dirname, '..'), 27150);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await blockRealNetwork(page);
    await page.goto('http://localhost:27150/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');
    const r = await page.evaluate(async () => {
      const out = { calls: [] };
      const rows = [
        { code: 'OVERPAID', severity: 'warn', customer_id: 1, client_name: '<b>홍길동</b>', detail: '입금합계 1200000원이 금액 1027000원보다 큼' },
        { code: 'PRICE_DIFF', severity: 'info', customer_id: 2, client_name: '김철수', detail: '금액 다름' }
      ];
      let serverAcks = [];
      let failIssues = false, failAck = false;
      window.prompt = () => '환불 예정';
      window.sbXHR = function (m, p, d, cb) {
        out.calls.push(m + ' ' + p.split('?')[0]);
        if (m === 'GET' && p.indexOf('data_integrity_issues') === 0) return failIssues ? cb({ status: 500 }, null) : cb(null, rows);
        if (m === 'GET' && p.indexOf('integrity_acks') === 0) return cb(null, serverAcks.slice());
        if (m === 'POST' && p === 'integrity_acks') { if (failAck) return cb({ status: 500 }, null); out.posted = d; serverAcks.push({ ack_key: d.ack_key }); return cb(null, [d]); }
        cb(null, []);
      };
      renderIntegrityBanner(true);
      const bn = () => document.getElementById('integrity-banner');
      out.shown = !!bn();
      out.text = bn().innerText;
      out.textAll = bn().textContent;
      out.escaped = bn().innerHTML.indexOf('<b>홍길동</b>') < 0;
      out.comma = out.textAll.indexOf('1,200,000원') >= 0;
      out.hasTime = /마지막 점검 \d\d:\d\d/.test(out.textAll);
      // 확인 저장 실패 시에는 숨기지 않음
      failAck = true; document.querySelectorAll('.integrity-ok')[0].click();
      out.afterFailedAck = document.querySelectorAll('.integrity-ok').length;
      failAck = false;
      document.querySelectorAll('.integrity-ok')[0].click();
      out.afterOne = document.querySelectorAll('.integrity-ok').length;
      out.postedNote = out.posted && out.posted.note; out.postedKey = out.posted && out.posted.ack_key;
      // 다른 기기(서버에 이미 기록됨)에서도 같은 상태: 캐시를 버리고 다시 조회해도 숨겨진 채
      renderIntegrityBanner(true);
      out.afterReload = document.querySelectorAll('.integrity-ok').length;
      document.querySelectorAll('.integrity-ok')[0].click();
      out.normalLine = bn().textContent;
      // 조회 실패 - 이상 없음처럼 보이면 안 됨
      failIssues = true; renderIntegrityBanner(true);
      out.failText = bn().textContent;
      // 이상 없음
      failIssues = false; rows.length = 0; renderIntegrityBanner(true);
      out.emptyText = bn().textContent;
      return out;
    });
    ok(r.calls.indexOf('GET data_integrity_issues') >= 0 && r.calls.indexOf('GET integrity_acks') >= 0, '점검 뷰와 확인 기록을 함께 조회함: ' + r.calls.slice(0, 2).join(','));
    ok(r.shown && /2건/.test(r.text) && /중요 1/.test(r.text), '이상이 있으면 건수와 중요 건수가 표시됨');
    ok(r.escaped, '고객 이름의 HTML이 그대로 실행되지 않음(이스케이프)');
    ok(r.comma, '금액이 천 단위 쉼표로 표시됨');
    ok(r.hasTime, '마지막 점검 시각이 표시됨');
    ok(r.afterFailedAck === 2, '확인 기록 저장에 실패하면 항목을 숨기지 않음');
    ok(r.afterOne === 1 && r.postedNote === '환불 예정' && /^OVERPAID\|1\|/.test(r.postedKey), '확인함 → 메모와 함께 DB에 기록되고 그 항목만 숨겨짐: ' + r.postedKey);
    ok(r.afterReload === 1, '다시 조회해도(다른 기기처럼) 확인한 항목은 숨겨진 채');
    ok(/데이터 점검 정상/.test(r.normalLine), '전부 확인하면 "정상" 한 줄만 남음');
    ok(/불러오지 못했어요/.test(r.failText) && /이상이 없다는 뜻이 아니에요/.test(r.failText), '조회 실패는 "이상 없음"처럼 보이지 않고 눈에 띄게 알림');
    ok(/데이터 점검 정상/.test(r.emptyText), '이상이 없으면 "정상" 표시');
    ok(errs.length === 0, 'JS 오류 없음 ' + errs.join('|'));
  } catch (e) { console.log('❌ 예외', e.message); fail++; }
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})();
