const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9884;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 1) 5가지 이벤트 타입이 각각 사람이 읽을 수 있는 문장으로 포맷되는지
  const r1 = await page.evaluate(() => {
    var samples = [
      { event_type: 'stage_change', staff_name: '마스터', created_at: new Date().toISOString(), event_detail: { customerName: '홍길동', from: '가견적', to: '선금결제' } },
      { event_type: 'payment_save', staff_name: '오지은 실장', created_at: new Date().toISOString(), event_detail: { customerName: '김철수', hasDeposit: true, hasBalance: false } },
      { event_type: 'alimtalk_send', staff_name: '마스터', created_at: new Date().toISOString(), event_detail: { customerName: '이영희', label: '3. 가견적서 발송' } },
      { event_type: 'claim_unassigned', staff_name: '오지은 실장', created_at: new Date().toISOString(), event_detail: { name: '박민수', by: '오지은 실장' } },
      { event_type: 'staff_offboard', staff_name: '마스터', created_at: new Date().toISOString(), event_detail: { from: '오지은 실장', to: '마스터', customerCount: 24, estimateCount: 21, note: '색상 미결정 건 있음' } }
    ];
    return samples.map(function(s) { return formatAuditEvent(s); });
  });
  ok('1. stage_change 포맷', r1[0].indexOf('홍길동 단계 변경: 가견적 → 선금결제') === 0, r1[0]);
  ok('2. payment_save 포맷', r1[1].indexOf('김철수 결제정보 저장') === 0 && r1[1].indexOf('계약금:있음') !== -1, r1[1]);
  ok('3. alimtalk_send 포맷', r1[2].indexOf('이영희에게 [3. 가견적서 발송] 발송') === 0, r1[2]);
  ok('4. claim_unassigned 포맷', r1[3].indexOf('박민수 담당 확정 (오지은 실장)') === 0, r1[3]);
  ok('5. staff_offboard 포맷(메모 포함)', r1[4].indexOf('메모: 색상 미결정 건 있음') !== -1, r1[4]);

  // 2) 노이즈성 이벤트(tab_view 등)는 AUDIT_EVENT_TYPES에서 제외돼있는지
  const r2 = await page.evaluate(() => AUDIT_EVENT_TYPES.indexOf('tab_view'));
  ok('6. tab_view(사용성로그)는 감사로그 대상에서 제외됨', r2 === -1);

  // 3) 모달 열기 → sbXHR mock으로 목록 렌더 확인
  await page.evaluate(() => {
    window.sbXHR = function(method, path, data, cb) {
      cb(null, [
        { event_type: 'staff_offboard', staff_name: '마스터', created_at: new Date().toISOString(), event_detail: { from: '오지은 실장', to: '마스터', customerCount: 3, estimateCount: 2, note: '테스트메모' } }
      ]);
    };
    showAuditLogModal();
  });
  await new Promise(res => setTimeout(res, 400));
  const r3 = await page.evaluate(() => {
    var el = document.getElementById('audit-log-list');
    return { text: el ? el.textContent : '', hasOverlay: !!document.getElementById('audit-log-overlay') };
  });
  ok('7. 모달이 실제로 뜸', r3.hasOverlay);
  ok('8. 목록에 실제 이관 이력 표시됨', r3.text.indexOf('오지은 실장 → 마스터 이관') !== -1, r3.text);
  ok('9. 메모 내용도 함께 노출됨', r3.text.indexOf('테스트메모') !== -1);

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 30000);
