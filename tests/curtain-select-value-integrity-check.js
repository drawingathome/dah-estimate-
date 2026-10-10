// 견적서 select값(주름/개폐/시접/블라인드종류/손잡이) 유실 방지 영구 회귀테스트
// 2026-09-08(선혜님 지적 - "위에 말한 부분 모두다 확인했던건데 계속 같은
// 문제가 또 생기고 있지???? 이래서 너를 믿겠니??"): 같은 종류의 문제가
// 8/29(다시보기 복원 누락), 9/8 1차(터치영역 - 틀린 진단), 9/8 2차(복사시
// cloneNode 함정)까지 세 번이나 재발했음. 매번 "이번엔 확실하다"고
// 말로만 안심시키는 대신, 이 값들이 유실될 수 있는 모든 알려진 경로를
// 한 곳에 모아 매번 자동으로 검증하는 영구 테스트로 만듦 - 말이 아니라
// 테스트가 다음 재발을 잡아내도록.
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9860;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let anyFail = false;

  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(''); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });

  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await page.evaluate(() => { document.getElementById('est-auth-gate').style.display = 'none'; });

  // ── 경로 1: 커튼/블라인드/서비스 "복사" 버튼 ──
  {
    await page.evaluate(() => {
      document.getElementById('curtain-body').innerHTML = '';
      document.getElementById('blind-body').innerHTML = '';
      addCurtainRow();
      addBlindRow();
    });
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
      document.querySelector('.pleat-type').value = '민자형';
      document.querySelector('.open-type').value = '편개형';
      document.querySelector('.hem-type').value = '8cm';
      document.querySelector('.blind-kind').value = '롤스크린';
      document.querySelector('.handle-dir').value = '우손';
    });
    await page.evaluate(() => {
      document.querySelector('.row-curtain [onclick*="copyCurtainRow"]').click();
    });
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
      var blindRow = document.getElementById('blind-body').firstElementChild;
      blindRow.querySelector('[onclick*="copyBlindRow"]').click();
    });
    await new Promise(r => setTimeout(r, 200));

    const copied = await page.evaluate(() => ({
      pleatTypes: Array.from(document.querySelectorAll('.pleat-type')).map(s => s.value),
      openTypes: Array.from(document.querySelectorAll('.open-type')).map(s => s.value),
      hemTypes: Array.from(document.querySelectorAll('.hem-type')).map(s => s.value),
      blindKinds: Array.from(document.querySelectorAll('.blind-kind')).map(s => s.value),
      handleDirs: Array.from(document.querySelectorAll('.handle-dir')).map(s => s.value)
    }));
    const ok1 = copied.pleatTypes.every(v => v === '민자형') && copied.openTypes.every(v => v === '편개형') && copied.hemTypes.every(v => v === '8cm');
    console.log(ok1 ? '✅' : '❌', '[경로1: 커튼복사] 주름/개폐/시접 값이 복사본에도 정확히 유지됨', JSON.stringify(copied));
    if (!ok1) anyFail = true;
    const ok2 = copied.blindKinds.every(v => v === '롤스크린') && copied.handleDirs.every(v => v === '우손');
    console.log(ok2 ? '✅' : '❌', '[경로1: 블라인드복사] 종류/손잡이 값이 복사본에도 정확히 유지됨', JSON.stringify(copied));
    if (!ok2) anyFail = true;
  }

  // ── 경로 2: restoreLineItemsToForm (견적서 다시 열기/이력 불러오기) ──
  {
    const restored = await page.evaluate(() => {
      var items = [{
        type: 'curtain', space: '거실', displayName: '테스트커튼',
        pleatType: '나비주름형', openType: '양개형', hemType: '5cm', mw: '435', mh: '200', pnum: '5', price: 100000
      }, {
        type: 'blind', space: '주방', displayName: '테스트블라인드',
        kind: '알루미늄', handle: '좌손', bmw: '100', bmh: '150', price: 50000
      }];
      restoreLineItemsToForm(items, null);
      return {
        pleatType: document.querySelector('.pleat-type').value,
        openType: document.querySelector('.open-type').value,
        hemType: document.querySelector('.hem-type').value,
        pnum: document.querySelector('.pnum').value,
        blindKind: document.querySelector('.blind-kind').value,
        handleDir: document.querySelector('.handle-dir').value
      };
    });
    const ok3 = restored.pleatType === '나비주름형' && restored.openType === '양개형' && restored.hemType === '5cm';
    console.log(ok3 ? '✅' : '❌', '[경로2: 견적서 다시열기] 커튼 주름/개폐/시접 정확히 복원됨', JSON.stringify(restored));
    if (!ok3) anyFail = true;
    // 2026-09-08(선혜님 지시로 전수감사 중 발견 - 8/29 유형과 같은 재발):
    // 폭수(pnum)를 복원해도 곧바로 calcCurtainRow(mw) 호출이 "가로길이가
    // 방금 바뀐 것"으로 오인해 자동계산값으로 덮어쓰던 심각한 버그.
    const ok3b = restored.pnum === '5';
    console.log(ok3b ? '✅' : '❌', '[경로2: 견적서 다시열기] 커튼 수량(pnum)이 자동계산으로 안 덮어써짐', JSON.stringify({pnum: restored.pnum}));
    if (!ok3b) anyFail = true;
    const ok4 = restored.blindKind === '알루미늄' && restored.handleDir === '좌손';
    console.log(ok4 ? '✅' : '❌', '[경로2: 견적서 다시열기] 블라인드 종류/손잡이 정확히 복원됨');
    if (!ok4) anyFail = true;
  }

  // ── 경로 3: loadDraft (임시저장 자동복원) ──
  {
    const draftRestored = await page.evaluate(() => {
      return new Promise((resolve) => {
        var draft = {
          savedAt: new Date().toISOString(),
          data: {
            lineItems: [{
              type: 'curtain', space: '안방', pleatType: '민자형', openType: '편개형', hemType: '8cm', mw: '250', mh: '200', pnum: '4', price: 90000
            }, {
              type: 'blind', space: '서재', kind: '로만쉐이드', handle: '우손', bmw: '120', bmh: '140', price: 60000
            }]
          }
        };
        localStorage.setItem('dah_estimate_draft', JSON.stringify(draft));
        var origConfirm = window.confirm;
        window.confirm = function () { return true; };
        loadDraft();
        window.confirm = origConfirm;
        setTimeout(function () {
          resolve({
            pleatType: document.querySelector('.pleat-type').value,
            openType: document.querySelector('.open-type').value,
            hemType: document.querySelector('.hem-type').value,
            pnum: document.querySelector('.pnum').value,
            blindKind: document.querySelector('.blind-kind').value,
            handleDir: document.querySelector('.handle-dir').value
          });
        }, 100);
      });
    });
    const ok5 = draftRestored.pleatType === '민자형' && draftRestored.openType === '편개형' && draftRestored.hemType === '8cm';
    console.log(ok5 ? '✅' : '❌', '[경로3: 임시저장 복원] 커튼 주름/개폐/시접 정확히 복원됨', JSON.stringify(draftRestored));
    if (!ok5) anyFail = true;
    // 2026-09-08(선혜님 지시로 전수감사 중 발견): loadDraft에서 수량(pnum)
    // 복원이 통째로 빠져있던 별도 버그 - 재발방지로 이 테스트에 함께 등록.
    const ok5b = draftRestored.pnum === '4';
    console.log(ok5b ? '✅' : '❌', '[경로3: 임시저장 복원] 커튼 수량(pnum) 정확히 복원됨', JSON.stringify({pnum: draftRestored.pnum}));
    if (!ok5b) anyFail = true;
    const ok6 = draftRestored.blindKind === '로만쉐이드' && draftRestored.handleDir === '우손';
    console.log(ok6 ? '✅' : '❌', '[경로3: 임시저장 복원] 블라인드 종류/손잡이 정확히 복원됨');
    if (!ok6) anyFail = true;
    await page.evaluate(() => localStorage.removeItem('dah_estimate_draft'));
  }

  await browser.close();
  process.exit(anyFail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 25000);
