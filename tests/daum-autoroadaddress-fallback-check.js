#!/usr/bin/env node
// tests/daum-autoroadaddress-fallback-check.js
// ══════════════════════════════════════════════════
// 2026-10-02(선혜님 - "검색창 눌러서 쓰지 당연히!! 검색결과 선택하고~ 최근주소는 쓰지도
// 않았다!!!!" 지적으로 재조사해 발견한 진짜 원인): "최근 주소" 칩이나 직접 타이핑이 아니라,
// 정상적으로 검색창을 열고 결과를 선택하는 흐름 자체에서 버그가 있었음.
//
// Daum 우편번호 서비스 공식 Q&A: "사용자가 지번-도로명 1:N 관계에서 메인 지번주소를 선택할
// 경우, 도로명 주소는 roadAddress가 아니라 별도 필드인 autoRoadAddress에 들어간다." 지금까지
// openKakaoAddr()는 data.roadAddress || data.jibunAddress만 읽어서 autoRoadAddress를 전혀
// 안 봤음 - 대단지 아파트(반포자이, 트리니원 등) 검색 결과에서 "지번" 쪽 줄을 선택하면
// roadAddress가 비고, jibunAddress도 건물명 위주로 짧게 나와 "반포자이 138동 1504호"처럼
// 도로명 없이 저장되는 정확한 메커니즘으로 확인됨(이 테스트로 실제 재현).
//
// 수정: autoRoadAddress/autoJibunAddress까지 순서대로 fallback에 포함.
//
// 사용법: node tests/daum-autoroadaddress-fallback-check.js
// ══════════════════════════════════════════════════
const { launchBrowser, startServer } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };

(async () => {
  const port = 36000;
  const server = await startServer('/home/claude/dah-repo', port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) { req.respond({status:200, contentType:'application/json', headers:CORS, body:'[]'}); return; }
    if (url.includes('daumcdn.net')) { req.abort(); return; } // 실제 다음 스크립트는 로드 안 함 - 가짜 daum 객체로 대체
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));

  // 실제 Daum 우편번호 API가 "메인 지번주소를 선택"했을 때 주는 것과 동일한 형태로 모킹:
  // roadAddress는 비어있고(실제로 이런 응답이 실재함, 공식 Q&A로 확인됨), autoRoadAddress에만
  // 진짜 도로명주소가 들어있는 경우
  const result = await page.evaluate(() => {
    window.daum = {
      Postcode: function(opts) {
        this.open = function() {
          opts.oncomplete({
            roadAddress: '',  // 지번주소를 선택한 경우 비어있음(공식 Q&A로 확인된 실제 동작)
            autoRoadAddress: '서울 서초구 신반포로 42',  // 진짜 도로명주소는 여기 들어있음
            jibunAddress: '반포자이 138동',  // 대단지의 경우 지번주소가 건물명 위주로 짧게 나오는 경우
            autoJibunAddress: ''
          });
        };
      }
    };
    openKakaoAddr('c-addr', 'c-addr2');
    return document.getElementById('c-addr').value;
  });
  console.log('roadAddress 비어있고 autoRoadAddress만 있을 때 c-addr에 채워진 값:', JSON.stringify(result));
  console.log('JS 에러:', jsErrors.length === 0 ? '없음' : jsErrors.join('; '));

  await browser.close(); server.kill();
  const ok = result === '서울 서초구 신반포로 42' && jsErrors.length === 0;
  console.log('\n' + (ok ? '✅ autoRoadAddress를 정확히 fallback으로 가져와서 진짜 도로명주소가 채워짐' : '❌ 여전히 문제 있음'));
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
