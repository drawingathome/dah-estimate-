// 운영 예행 합본 SQL이 (1) 결과를 오류 메시지로 돌려주고 (2) 아무것도 남기지 않으며 (3) 가드가 고장이면 시험이 잡는지, 가짜 운영 닮은꼴 DB에서 확인
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const R='/tmp/claude-0/-home-claude/45e3027c-d643-5179-9db1-f71ebf1949ca/scratchpad/r/docs/db/';
const src = fs.readFileSync(new URL('./rehearse_n24_real.mjs', import.meta.url),'utf8');
// 같은 준비 SQL(운영 실제 트리거 포함)을 재사용: rehearse_n24_real.mjs의 첫 db.exec(`...`) 블록을 추출
const setup = src.slice(src.indexOf('await db.exec(`')+15, src.indexOf('`);', src.indexOf('await db.exec(`')));
const out=[]; const ok=(l,c,d)=>out.push((c?'✅ ':'❌ ')+l+(d?' — '+d:''));
const M='00000000-0000-0000-0000-000000000001';
async function run(mod){
  const db=new PGlite();
  await db.exec(setup.replace(/\$\{M\}/g,M).replace(/\$\{S\}/g,'00000000-0000-0000-0000-000000000002'));
  // 운영의 auth.uid()는 요청 토큰(request.jwt.claim.sub)을 읽는다 → 가짜 DB도 같게 맞춤(안 맞추면 로그인 안 한 서버 작업으로 취급돼 시험이 헛돈다)
  await db.exec("create or replace function auth.uid() returns uuid language sql as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true),''), nullif(current_setting('app.uid', true),''))::uuid $$");
  let sql=fs.readFileSync(R+'2026-10-27_closed_month_guard_prod_rehearse.sql','utf8');
  if(mod) sql=mod(sql);
  let msg=null; try{ await db.exec(sql); }catch(e){ msg=e.message; }
  const guardLeft=(await db.query("select count(*)::int c from pg_proc where proname='dah_closed_month_guard'")).rows[0].c;
  const logTbl=(await db.query("select count(*)::int c from information_schema.tables where table_name='closed_month_edit_log'")).rows[0].c;
  const dep=(await db.query("select deposit_amount::int d from estimates where id='11111111-1111-1111-1111-111111111111'")).rows[0].d;
  return {msg,guardLeft,logTbl,dep};
}
let r=await run();
ok('끝에 REHEARSAL_RESULT 오류로 결과를 돌려줌', !!r.msg && r.msg.includes('REHEARSAL_RESULT'), r.msg);
ok('시험 5항목 모두 PASS(FAIL 없음)', !!r.msg && !r.msg.includes('FAIL') && (r.msg.match(/PASS/g)||[]).length>=5, r.msg);
ok('예행 뒤 가드 함수·기록 표가 남지 않음(전부 취소)', r.guardLeft===0 && r.logTbl===0, JSON.stringify(r));
ok('예행 뒤 입금액이 원래대로(1,000,000)', r.dep===1000000, String(r.dep));
// 역검증: 가드가 막지 않도록 고장낸 버전 → T1 FAIL이 보고돼야 함
let b=await run(s=>s.replace("raise exception '마감된 달(%)의 입금 기록은 수정할 수 없습니다. 마스터에게 요청하세요.', v_hit using errcode = '42501';","null;"));
ok('역검증: 가드를 고장내면 시험이 T1 FAIL로 잡음', !!b.msg && b.msg.includes('T1 실장 마감월 변경 FAIL'), b.msg);
ok('역검증 뒤에도 아무것도 남지 않음', b.guardLeft===0 && b.logTbl===0 && b.dep===1000000, JSON.stringify(b));
console.log(out.join('\n')); console.log(out.some(l=>l.startsWith('❌'))?'\n❌ 실패 있음':'\n✅ 모두 통과');
