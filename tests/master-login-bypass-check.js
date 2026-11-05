#!/usr/bin/env node
// tests/master-login-bypass-check.js
// 2026-11-05(N-123): 마스터 로그인에 '이메일 칸이 비어 있으면 코드에 적힌 고정 비밀번호로 마스터 화면이 열리는' 통로가 있었음(공개 저장소에 노출).
// 이 시험은 그 통로가 다시 생기지 않았는지 감시한다: ①이메일 없이 예전 고정 문구를 넣어도 로그인 안 됨 ②서버 인증이 실패하면(잘못된 비밀번호) 로그인 안 됨
// ③어떤 경우에도 마스터 확인 창이 JS 오류 없이 안내 문구를 보여 줌 ④배포 파일 어디에도 예전 고정 문구가 없음.
const fs = require('fs'); const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');
(async () => {
  const filePath = process.argv[2]; if (!filePath) { console.error('사용법: node master-login-bypass-check.js dah-dashboard.html'); process.exit(1); }
  const dir = path.dirname(path.resolve(filePath)); const file = path.basename(filePath);
  const port = 20401 + Math.floor(Math.random() * 400);
  const server = await startServer(dir, port); const browser = await launchBrowser();
  let fail = 0; const ok = (l, c, d) => { if (c) console.log('  ✅ ' + l); else { console.log('  ❌ ' + l + ' — ' + (typeof d === 'string' ? d : JSON.stringify(d))); fail++; } };
  const OLD = ['dah' + '2012', 'DAH-' + '임시' + '2026'];
  async function attempt(email, pw, authOk) {
    const page = await browser.newPage(); const errs = []; let tokenCalls = 0;
    page.on('pageerror', e => errs.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', (req) => { const u = req.url();
      if (req.method() === 'OPTIONS' && u.includes('supabase.co')) { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (u.includes('/auth/v1/token')) { tokenCalls++; req.respond({ status: authOk ? 200 : 400, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(authOk ? { access_token: 'x.y.z', user: { id: 'u', email } } : { error_description: 'Invalid login credentials' }) }); return; }
      if (u.includes('supabase.co') && u.includes('app_settings')) { req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[{"value":{}}]' }); return; }
      if (u.includes('supabase.co') || u.includes('script.google.com')) { req.abort(); return; }
      if (u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) { req.continue(); return; } req.abort(); });
    await page.setViewport({ width: 1200, height: 800 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 900));
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} document.getElementById('btn-master-login').click(); });
    await new Promise(r => setTimeout(r, 300));
    if (email) await page.type('#master-email-input', email);
    await page.type('#master-pw-input', pw);
    await page.evaluate(() => { document.getElementById('btn-master-confirm').click(); });
    await new Promise(r => setTimeout(r, 700));
    const res = await page.evaluate(() => ({ role: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.role : 'none', msg: (document.getElementById('master-pw-error') || {}).textContent || '' }));
    await page.close(); return { ...res, errs, tokenCalls };
  }
  console.log('\n[마스터 로그인 우회 통로 감시] ' + file);
  for (const w of OLD) {
    const r = await attempt('', w, false);
    ok('이메일 없이 예전 고정 문구(' + w.slice(0, 3) + '…)로는 로그인 안 됨', r.role === 'none', r);
    ok('  안내 문구가 이메일 입력을 요구함', /이메일/.test(r.msg), r.msg);
    ok('  서버 인증 요청 자체를 보내지 않음(고정 문구를 서버에 시도하지 않음)', r.tokenCalls === 0, r.tokenCalls);
    ok('  JS 오류 없음', r.errs.length === 0, r.errs);
  }
  const bad = await attempt('master@example.test', 'wrong-password', false);
  ok('이메일이 있어도 서버가 인증 거부하면 로그인 안 됨', bad.role === 'none', bad);
  const good = await attempt('master@example.test', 'right-password', true);
  ok('이메일+서버 인증 성공이면 정상 로그인(정상 경로가 막히지 않음)', good.role === 'master', good);
  const bad2 = [];
  for (const f of fs.readdirSync(dir)) { if (!/\.(html|js)$/.test(f)) continue; const s = fs.readFileSync(path.join(dir, f), 'utf8'); OLD.forEach(w => { if (s.includes(w)) bad2.push(f); }); }
  ok('배포 화면·스크립트 파일 어디에도 예전 고정 문구가 없음', bad2.length === 0, bad2);
  await browser.close(); server.close && server.close();
  console.log(fail === 0 ? '\n✅ 전체 통과' : '\n❌ ' + fail + '건 실패'); process.exit(fail === 0 ? 0 : 1);
})();
