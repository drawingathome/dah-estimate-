// scripts/uptime-check.js (N-64 ①, 2026-10-30)
// 사이트 다운 감시: 앱 주소 2곳이 열리고(화면 파일이 정상 내용인지), 서버(DB)가 응답하는지 가볍게 확인한다. 브라우저 없이 요청만 보냄.
// 3번까지 다시 시도(일시적 끊김 오탐 방지)하고, 끝까지 안 되면 종료코드 1 → GitHub 예약 작업이 빨간불 → 저장소 소유자에게 메일.
// 운영 데이터는 건드리지 않음(읽기 전용: 화면 파일 GET + 공개 함수 get_public_estimate에 존재하지 않는 번호 조회).
// 환경변수: UPTIME_TARGETS = "주소|화면에 있어야 할 글자,주소|글자" (시험용으로 바꿀 수 있음), UPTIME_DB_URL, UPTIME_DB_KEY(없으면 survey-app.js에서 읽음),
//          UPTIME_TRIES(기본 3), UPTIME_WAIT_MS(기본 20000), UPTIME_TIMEOUT_MS(기본 15000), UPTIME_SKIP_DB=1
const fs = require('fs'), path = require('path');
const TRIES = Number(process.env.UPTIME_TRIES || 3), WAIT = Number(process.env.UPTIME_WAIT_MS || 20000), TIMEOUT = Number(process.env.UPTIME_TIMEOUT_MS || 15000);
const targets = (process.env.UPTIME_TARGETS || 'https://dah-dashboard.vercel.app/dah-dashboard|DAH,https://dah-estimate.vercel.app/dah-estimate|DAH')
  .split(',').map(s => s.trim()).filter(Boolean).map(s => { const i = s.lastIndexOf('|'); return { url: s.slice(0, i), must: s.slice(i + 1) }; });

function readDbConfig() {
  const url = process.env.UPTIME_DB_URL || 'https://sradnglutbzbyyunjyah.supabase.co';
  let key = process.env.UPTIME_DB_KEY;
  if (!key) { try { const m = /SUPABASE_KEY\s*=\s*'([^']+)'/.exec(fs.readFileSync(path.join(__dirname, '..', 'survey-app.js'), 'utf8')); if (m) key = m[1]; } catch (e) {} }
  return { url, key };
}
async function get(url, opts) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try { const r = await fetch(url, Object.assign({ signal: ctl.signal, redirect: 'follow' }, opts || {})); const text = await r.text(); return { status: r.status, text }; }
  finally { clearTimeout(t); }
}
async function checkPage(t) {
  const r = await get(t.url);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  if (!r.text.includes(t.must)) throw new Error(`화면에 "${t.must}" 글자가 없음(빈 화면 또는 오류 페이지 가능, ${r.text.length}자)`);
  return `열림(${r.text.length}자)`;
}
async function checkDb() {
  const { url, key } = readDbConfig();
  if (!key) throw new Error('DB 공개 키를 찾지 못함(survey-app.js)');
  const r = await get(url + '/rest/v1/rpc/get_public_estimate', { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: '00000000-0000-4000-8000-000000000000' }) });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  let rows; try { rows = JSON.parse(r.text); } catch (e) { throw new Error('응답이 JSON이 아님'); }
  if (!Array.isArray(rows)) throw new Error('예상 밖 응답 모양');
  return '응답 정상(없는 번호 → 빈 목록)';
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function withRetry(label, fn) {
  let last;
  for (let i = 1; i <= TRIES; i++) {
    try { const msg = await fn(); console.log(`✅ ${label}: ${msg}${i > 1 ? ` (시도 ${i}번째에 성공)` : ''}`); return true; }
    catch (e) { last = e; console.log(`⚠️ ${label}: 시도 ${i}/${TRIES} 실패 — ${e.message || e}`); if (i < TRIES) await sleep(WAIT); }
  }
  console.log(`❌ ${label}: ${TRIES}번 모두 실패 — ${last && (last.message || last)}`);
  return false;
}
(async () => {
  const results = [];
  for (const t of targets) results.push(await withRetry(t.url, () => checkPage(t)));
  if (process.env.UPTIME_SKIP_DB !== '1') results.push(await withRetry('서버(DB) 공개 함수', checkDb));
  const bad = results.filter(x => !x).length;
  console.log(bad ? `\n❌ 감시 실패 ${bad}건 — 앱이 멈췄을 수 있어요. 장애 대응 절차 문서의 첫 단계를 확인하세요.` : '\n✅ 모두 정상');
  process.exit(bad ? 1 : 0);
})();
