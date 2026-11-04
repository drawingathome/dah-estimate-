// tests/memo-draft-stale-check.js
// 2026-11-05(N-109, N-71② 임시저장 전수 점검): 고객 메모 임시저장(dah_memo_draft_<고객번호>)이 기한·기준 없이 남아,
// 다른 사람이 메모를 바꾼 뒤에도 낡은 초안이 새 메모를 가렸음(잔금 날짜 N-63과 같은 유형). 기준: 오늘 저장한 초안이고, 초안을 쓸 때의
// 서버 메모가 지금과 같을 때만 되살림. 예전 형식(그냥 문자열) 초안은 버림.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function openMemo(page, draftRaw) {
  return page.evaluate(async (draftRaw) => {
    saveCustomers([{ id: 8801, clientName: '메모초안고객', phone: '01099998801', stage: '상담', staffName: '마스터', memo: '서버의 새 메모' }]);
    localStorage.removeItem('dah_memo_draft_8801');
    openDetail('메모초안고객', 8801);
    await new Promise(r => setTimeout(r, 600));
    if (draftRaw !== null) localStorage.setItem('dah_memo_draft_8801', draftRaw); // 초안은 메모를 누르는 순간 읽으므로 화면이 열린 뒤에 심음
    var blocks = Array.from(document.querySelectorAll('div')).filter(d => d.style && d.style.cursor === 'pointer' && d.textContent.indexOf('서버의 새 메모') !== -1 && d.style.background.indexOf('255') !== -1);
    var blk = blocks[blocks.length - 1] || null;
    if (!blk) return { ok: false, why: '메모 블록 없음' };
    blk.click();
    await new Promise(r => setTimeout(r, 200));
    var ta = blk.querySelector('textarea');
    return { ok: !!ta, value: ta ? ta.value : null };
  }, draftRaw);
}

(async () => {
  const dir = path.resolve(__dirname, '..');
  const server = await startServer(dir, 9961);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 1400 });
  await page.goto('http://localhost:9961/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  const today = await page.evaluate(() => todayStr());
  const log = []; const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (!c ? ' — ' + JSON.stringify(d) : ''));
  const r0 = await openMemo(page, null);
  ok('0. 초안이 없으면 서버 메모가 보임(시험 장치 점검)', r0.ok && r0.value === '서버의 새 메모', r0);
  const r1 = await openMemo(page, '낡은 예전 형식 초안');
  ok('1. 예전 형식(문자열) 초안은 버리고 서버 메모를 보임', r1.ok && r1.value === '서버의 새 메모', r1);
  const r2 = await openMemo(page, JSON.stringify({ v: '어제 쓴 초안', base: '서버의 새 메모', day: '2000-01-01' }));
  ok('2. 어제 이전에 저장된 초안은 버림', r2.ok && r2.value === '서버의 새 메모', r2);
  const r3 = await openMemo(page, JSON.stringify({ v: '다른 메모 기준 초안', base: '예전 메모', day: today }));
  ok('3. 초안을 쓸 때의 서버 메모와 지금 메모가 다르면(그 사이 누가 고침) 초안을 버림', r3.ok && r3.value === '서버의 새 메모', r3);
  const r4 = await openMemo(page, JSON.stringify({ v: '오늘 쓰던 초안', base: '서버의 새 메모', day: today }));
  ok('4. 오늘 쓰던 정상 초안은 되살림', r4.ok && r4.value === '오늘 쓰던 초안', r4);
  ok('5. 화면 오류 없음', errs.length === 0, errs);
  log.forEach(l => console.log(l));
  const f = log.filter(l => l.startsWith('❌')).length;
  console.log(f === 0 ? '\n전체 통과' : '\n실패 ' + f + '건');
  await browser.close(); server.kill(); process.exit(f === 0 ? 0 : 1);
})();
