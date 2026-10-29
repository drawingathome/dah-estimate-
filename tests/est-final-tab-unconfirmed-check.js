#!/usr/bin/env node
// tests/est-final-tab-unconfirmed-check.js
// 2026-10-20: "최종견적서 탭 + 확정 안 누름" 상태로 인쇄·PDF하면 확인창이 뜨고, 확정 버튼이 주황색 "확정 안 됨"으로 눈에 띄는지 확인.
// (시험가 사례: 저장 영수증상 탭만 켜고 확정은 한 번도 안 눌렸는데 종이는 최종견적서처럼 나옴)
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');
async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node est-final-tab-unconfirmed-check.js <dah-estimate.html경로>'); process.exit(1); }
  const dir = path.dirname(path.resolve(filePath)), file = path.basename(filePath);
  const port = 19951 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let fail = 0;
  const check = (l, c, d) => { if (c) console.log('  ✅ ' + l); else { console.log('  ❌ ' + l + ' — ' + JSON.stringify(d)); fail++; } };
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));
  console.log('\n[최종견적서 탭 미확정 검사] ' + file);
  const r = await page.evaluate(() => {
    const out = {};
    document.getElementById('c-name').value = '테스트고객';
    window._estEditState.estimateConfirmedAt = null;
    setStatus('ga');
    out.gaBadge = document.getElementById('hd-confirm-badge').textContent;
    setStatus('final');
    out.finalBadge = document.getElementById('hd-confirm-badge').textContent;
    out.finalBg = document.getElementById('hd-confirm-badge').style.background;
    // 취소: 진행 안 함
    let asked = 0, proceeded = 0;
    window.confirm = () => { asked++; return false; };
    ensureEstimateSavedThen(() => { proceeded++; });
    out.cancel = { asked, proceeded };
    // 확정됨 상태: 확인창 없이 진행 (저장 필요 없는 상태로 맞춤)
    window._estEditState.estimateConfirmedAt = new Date().toISOString();
    renderConfirmBadge();
    out.confBadge = document.getElementById('hd-confirm-badge').textContent;
    asked = 0; proceeded = 0;
    document.getElementById('c-name').dataset.saved = '1';
    ensureEstimateSavedThen(() => { proceeded++; });
    out.confirmed = { asked, proceeded };
    // 가견적 탭 + 미확정: 확인창 없음
    window._estEditState.estimateConfirmedAt = null; setStatus('ga'); asked = 0; proceeded = 0;
    ensureEstimateSavedThen(() => { proceeded++; });
    out.gaPrint = { asked, proceeded };
    return out;
  });
  check('가견적 탭에서는 평소 "✓ 확정" 표시', r.gaBadge === '✓ 확정', r.gaBadge);
  check('최종견적서 탭 + 미확정이면 주황색 "확정 안 됨" 표시', /확정 안 됨/.test(r.finalBadge) && /230|126|rgb\(230|#E67E22/i.test(r.finalBg), [r.finalBadge, r.finalBg]);
  check('최종견적서 탭 + 미확정으로 인쇄하면 확인창이 뜨고, 취소하면 진행 안 함', r.cancel.asked === 1 && r.cancel.proceeded === 0, r.cancel);
  check('확정되면 "확정됨" 표시 + 확인창 없이 진행', /확정됨/.test(r.confBadge) && r.confirmed.asked === 0 && r.confirmed.proceeded === 1, [r.confBadge, r.confirmed]);
  check('가견적 탭 + 미확정 인쇄는 확인창 없이 진행(예전과 동일)', r.gaPrint.asked === 0, r.gaPrint);
  check('자바스크립트 오류 없음', errs.length === 0, errs);
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
