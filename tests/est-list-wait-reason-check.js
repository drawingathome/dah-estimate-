#!/usr/bin/env node
// tests/est-list-wait-reason-check.js
// N-162 (2026-11-12): 입금이 끝나 '잔금결제'인데 '시공준비중'으로 안 넘어간 고객은, 견적서 목록 카드에 이유(안 끝난 발주)를 보여 준다.
// 사용법: node tests/est-list-wait-reason-check.js dah-dashboard.html
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node est-list-wait-reason-check.js <dah-dashboard.html경로>'); process.exit(1); }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 20601 + Math.floor(Math.random() * 300);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let failCount = 0;
  function check(label, condition, detail) {
    if (condition) console.log(`  ✅ ${label}`);
    else { console.log(`  ❌ ${label} — ${detail}`); failCount++; }
  }
  console.log('\n[견적서 목록 — 시공준비중 대기 사유 표시 검사] ' + file);
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 1100, height: 1000 });
  await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  const res = await page.evaluate(() => {
    const done = k => ({ done: true, vendor: 'x' });
    const base = { phone: '01000000041', addr: '서울', stage: '잔금결제', staffName: '마스터', date: '2026-10-01' };
    const mk = (id, name, extra) => Object.assign({}, base, { id, clientName: name }, extra);
    saveCustomers([
      // 변준호형: 원단·제작·자재 완료, 시공일 없음
      mk(9401, '시공일없음고객', { installDate: '', installDateTbd: false, orderStatus: { fabric: done(), production: done(), material: done() } }),
      // 민지성형: 시공일 있음, 원단 기록 없음
      mk(9402, '원단기록없음고객', { installDate: '2026-11-21', installDateTbd: false, orderStatus: { production: done(), material: done(), install: done() } }),
      // 문제 없음: 전부 완료(단계는 아직 잔금결제로 남아 있어도 사유 줄은 안 나와야 함)
      mk(9403, '전부완료고객', { installDate: '2026-11-21', installDateTbd: false, orderStatus: { fabric: done(), production: done(), material: done() } }),
      // 다른 단계: 사유 줄 없음
      mk(9404, '확정견적고객', { stage: '확정견적', installDate: '', installDateTbd: false, orderStatus: {} })
    ]);
    const est = (id, name) => ({ id: 'e' + id, clientId: id, clientName: name, no: 'T-' + id, status: 'final', contractStatus: 'contracted', price: 1000000, curtainCount: 2, blindCount: 0, savedAt: '2026-11-01', lineItems: [{ type: 'curtain' }] });
    localStorage.setItem('dah_saved', JSON.stringify([est(9401, '시공일없음고객'), est(9402, '원단기록없음고객'), est(9403, '전부완료고객'), est(9404, '확정견적고객')]));
    goTab('estimates');
    renderEstList();
    const rows = Array.from(document.querySelectorAll('#est-list-body .est-list-item'));
    const out = {};
    rows.forEach(r => {
      const name = ['시공일없음고객', '원단기록없음고객', '전부완료고객', '확정견적고객'].find(n => r.textContent.includes(n));
      const note = r.querySelector('.est-wait-note');
      if (name) out[name] = note ? note.textContent : null;
    });
    return { out, n: rows.length };
  });
  check('목록에 4건이 그려짐', res.n === 4, 'rows=' + res.n);
  check('시공일 없는 고객: "시공일 입력 필요" 사유가 보임(N-164 기준)', /입금은 완료/.test(res.out['시공일없음고객'] || '') && /시공일 입력 필요/.test(res.out['시공일없음고객'] || ''), JSON.stringify(res.out['시공일없음고객']));
  check('원단 기록이 없어도 시공일이 있으면 사유 줄이 없음(발주 체크는 단계를 막지 않음)', res.out['원단기록없음고객'] === null, JSON.stringify(res.out['원단기록없음고객']));
  check('전부 완료한 고객: 사유 줄이 없음', res.out['전부완료고객'] === null, JSON.stringify(res.out['전부완료고객']));
  check('잔금결제가 아닌 단계: 사유 줄이 없음', res.out['확정견적고객'] === null, JSON.stringify(res.out['확정견적고객']));
  await browser.close(); server.close();
  if (failCount > 0) { console.log(`\n❌ ${failCount}개 실패`); process.exit(1); }
  console.log('\n✅ 모든 항목 통과');
}
run().catch(e => { console.error(e); process.exit(1); });
