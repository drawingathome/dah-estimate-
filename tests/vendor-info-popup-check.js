// tests/vendor-info-popup-check.js
// 2026-09-17(GitHub Issue #5 - "다음 세션 작업" 2026-09-09 확정 설계 구현):
// 발주서 원단/블라인드 거래처 입력칸이 .inner-fields(display:none) 안에
// 숨어있어서 실제로 아무도 안 채우던 문제를 해결하려고 만든 "발주정보
// 입력 팝업"(openVendorInfoInputModal). 핵심 설계 원칙 - 별도 데이터
// 구조를 안 만들고 원래 화면의 실제 input에 값을 그대로 반영하는 것 -
// 이 실제로 지켜지는지, 그리고 그 값으로 만든 실제 발주서 문서가
// "미지정"이 아니라 정확한 거래처명을 보여주는지까지 종단간으로 검증.
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 19871 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co') || url.includes('script.google.com')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.setViewport({ width: 390, height: 1000 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  const emptyCase = await page.evaluate(() => {
    document.querySelectorAll('#curtain-body tr, #blind-body tr').forEach(tr => tr.remove());
    try {
      openVendorInfoInputModal();
      return { crashed: false, modalOpened: !!document.getElementById('vendor-info-input-modal') };
    } catch (e) { return { crashed: true, error: e.message }; }
  });
  ok('0. 항목 없을 때 크래시 없이 안내(모달 안 열림)', !emptyCase.crashed && !emptyCase.modalOpened, JSON.stringify(emptyCase));

  await page.evaluate(() => {
    window._dahVendorListRaw = [
      { name: '덱스터', categories: ['blind'] },
      { name: '윈텍', categories: ['blind'] },
      { name: '캔가공소', categories: ['production'] },
      { name: '목성', categories: ['material'] }
    ];
    addCurtainRow();
    const ctr = document.querySelector('#curtain-body tr');
    ctr.querySelector('.space-inp').value = '거실';
    ctr.querySelector('.c-display-name').value = '거실커튼';
    ctr.querySelector('.mw').value = '300'; ctr.querySelector('.mh').value = '250';

    addBlindRow();
    const btr = document.querySelector('#blind-body tr');
    if (typeof refreshBlindVendorOptions === 'function') refreshBlindVendorOptions();
    btr.querySelector('.space-inp').value = '안방';
    btr.querySelector('.b-display-name').value = '안방블라인드';
    btr.querySelector('.bmw').value = '95'; btr.querySelector('.bmh').value = '155';
  });

  const openResult = await page.evaluate(() => {
    openVendorInfoInputModal();
    const modal = document.getElementById('vendor-info-input-modal');
    return { opened: !!modal, text: modal ? modal.textContent : null };
  });
  ok('1. 팝업이 정상적으로 열림', openResult.opened);
  ok('2. 커튼 공간/제품명/사이즈가 정확히 표시됨', openResult.text && openResult.text.includes('거실') && openResult.text.includes('거실커튼') && openResult.text.includes('300') && openResult.text.includes('250'));
  ok('3. 블라인드 공간/제품명/사이즈가 정확히 표시됨', openResult.text && openResult.text.includes('안방') && openResult.text.includes('안방블라인드') && openResult.text.includes('95') && openResult.text.includes('155'));
  ok('4. 가공소 자동배정 안내 표시됨(1곳뿐이라 자동)', openResult.text && openResult.text.includes('캔가공소') && openResult.text.includes('자동배정'));
  ok('5. 레일·부자재 자동배정 안내 표시됨', openResult.text && openResult.text.includes('목성'));

  const blindSelectCheck = await page.evaluate(() => {
    const modal = document.getElementById('vendor-info-input-modal');
    const select = modal.querySelector('select');
    return select ? Array.from(select.options).map(o => o.value) : null;
  });
  ok('6. 블라인드 거래처 드롭다운에 등록된 2곳(덱스터/윈텍)이 정확히 나옴', JSON.stringify(blindSelectCheck) === JSON.stringify(['', '덱스터', '윈텍']), JSON.stringify(blindSelectCheck));

  const confirmResult = await page.evaluate(() => {
    const modal = document.getElementById('vendor-info-input-modal');
    const input = modal.querySelector('input[list="fabric-vendor-list"]');
    input.value = '동대문원단';
    const select = modal.querySelector('select');
    select.value = '덱스터';
    const btn = Array.from(modal.querySelectorAll('button')).find(b => b.textContent.includes('확인'));
    btn.click();
    return {
      modalClosed: !document.getElementById('vendor-info-input-modal'),
      pickerOpened: !!document.getElementById('vendor-order-picker'),
      curtainVendorValue: document.querySelector('#curtain-body .c-vendor')?.value,
      blindVendorValue: document.querySelector('#blind-body .b-vendor')?.value
    };
  });
  ok('7. 확인 클릭시 팝업이 닫힘', confirmResult.modalClosed);
  ok('8. 확인 후 발주서 선택화면(기존 picker)으로 자동 이동', confirmResult.pickerOpened);
  ok('9. 실제 커튼 원단거래처(.c-vendor)에 입력값이 반영됨', confirmResult.curtainVendorValue === '동대문원단', confirmResult.curtainVendorValue);
  ok('10. 실제 블라인드 거래처(.b-vendor)에 선택값이 반영됨', confirmResult.blindVendorValue === '덱스터', confirmResult.blindVendorValue);

  await page.evaluate(() => { document.getElementById('vendor-order-picker')?.remove(); });
  const docResult = await page.evaluate(() => {
    printForVendor(null);
    const overlay = document.getElementById('pv-overlay');
    return overlay ? overlay.textContent : null;
  });
  ok('11. 반영된 거래처로 발주서를 열면 "미지정"이 아니라 실제 거래처명이 보임', docResult && docResult.includes('동대문원단') && !docResult.includes('미지정(원단)'));

  await page.evaluate(() => { document.getElementById('pv-overlay')?.remove(); });
  const reopenResult = await page.evaluate(() => {
    openVendorInfoInputModal();
    const modal = document.getElementById('vendor-info-input-modal');
    const input = modal.querySelector('input[list="fabric-vendor-list"]');
    const select = modal.querySelector('select');
    return { prefilledCurtain: input.value, prefilledBlind: select.value };
  });
  ok('12. 다시 열면 이전에 입력한 값이 미리 채워져 있음(재편집 가능)', reopenResult.prefilledCurtain === '동대문원단' && reopenResult.prefilledBlind === '덱스터', JSON.stringify(reopenResult));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
