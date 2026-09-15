const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9906;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 실제 supabase.createClient를 목업으로 바꿔서, setAuth가 몇 번 호출되는지,
  // 어떤 토큰으로 호출되는지 직접 추적
  const r = await page.evaluate(() => {
    var setAuthCalls = [];
    var fakeChannel = { on: function(){ return this; }, subscribe: function(cb){ if (cb) cb('SUBSCRIBED'); return this; } };
    var fakeClient = {
      realtime: { setAuth: function(token) { setAuthCalls.push(token); } },
      channel: function() { return fakeChannel; },
      removeChannel: function() {}
    };
    window.supabase = { createClient: function() { return fakeClient; } };
    // 내부 캐시된 클라이언트가 있으면 초기화(테스트 격리)
    if (typeof _supabaseRealtimeClient !== 'undefined') window._supabaseRealtimeClient = null;
    window._realtimeChannel = null;

    // 1) 최초 로그인 - 토큰A로 연결
    localStorage.setItem('dah_auth_session', JSON.stringify({ access_token: '토큰A', refresh_token: 'r', expires_at: Date.now() + 3600000 }));
    startRealtimeSync();

    // 2) 토큰 갱신 시뮬레이션(4분마다 자동갱신되는 것과 동일한 상황) - 채널은 이미 있는 상태에서 다시 호출
    localStorage.setItem('dah_auth_session', JSON.stringify({ access_token: '토큰B(갱신됨)', refresh_token: 'r', expires_at: Date.now() + 3600000 }));
    startRealtimeSync();

    return { setAuthCalls: setAuthCalls, channelCreateCount: 1 }; // fakeClient.channel은 항상 같은 fakeChannel 반환하므로 실제 재생성 여부는 별도 확인 어려움 - setAuth 호출 횟수/내용만 확인
  });

  ok('1. startRealtimeSync가 두 번 호출되면 setAuth도 두 번 호출됨(예전엔 두번째부터 호출 자체가 생략됐음)', r.setAuthCalls.length === 2, JSON.stringify(r.setAuthCalls));
  ok('2. 첫 번째 호출은 최초 토큰(토큰A)으로 인증', r.setAuthCalls[0] === '토큰A', JSON.stringify(r.setAuthCalls));
  ok('3. 두 번째 호출(토큰 갱신 후)은 새 토큰(토큰B)으로 다시 인증됨 - 이번에 고친 부분', r.setAuthCalls[1] === '토큰B(갱신됨)', JSON.stringify(r.setAuthCalls));

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
