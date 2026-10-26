import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const R='/tmp/claude-0/-home-claude/45e3027c-d643-5179-9db1-f71ebf1949ca/scratchpad/r/docs/db/';
const db=new PGlite(); const out=[]; const ok=(l,c,d)=>out.push((c?'✅ ':'❌ ')+l+(d?' — '+d:''));
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table t(id int primary key, v int, stage text);
insert into t values (1,0,'상담');
create function public.customers_auto_stage_on_deposit() returns trigger language plpgsql security definer as $f$ begin if new.v>0 then new.stage:='선금결제'; end if; return new; end $f$;
create function public.estimates_confirm_guard() returns trigger language plpgsql security definer as $f$ begin return new; end $f$;
create trigger trg_a before update on t for each row execute function public.customers_auto_stage_on_deposit();
create trigger trg_b before update on t for each row execute function public.estimates_confirm_guard();
-- 운영의 실제 권한표(읽기 확인값)와 같게: PUBLIC·anon·authenticated·service_role 모두 실행 가능
grant execute on function public.customers_auto_stage_on_deposit() to public, anon, authenticated, service_role;
grant execute on function public.estimates_confirm_guard() to public, anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant select, update on t to authenticated;
`);
const acl=async()=> (await db.query("select proname, proacl::text a from pg_proc where proname in ('customers_auto_stage_on_deposit','estimates_confirm_guard') order by 1")).rows;
const canExec=async(role,fn)=> (await db.query(`select has_function_privilege('${role}','public.${fn}()','execute') x`)).rows[0].x;
ok('적용 전: 로그인 안 한 사람(anon)이 함수 실행 가능(경고 상태 재현)', await canExec('anon','customers_auto_stage_on_deposit') && await canExec('anon','estimates_confirm_guard'));
await db.exec(fs.readFileSync(R+'2026-10-27_h5_trigger_fn_revoke_apply.sql','utf8'));
for (const role of ['anon','authenticated']) for (const fn of ['customers_auto_stage_on_deposit','estimates_confirm_guard']) ok(`적용 후: ${role}는 ${fn} 직접 실행 불가`, !(await canExec(role,fn)));
ok('적용 후: service_role은 그대로 실행 가능', await canExec('service_role','customers_auto_stage_on_deposit') && await canExec('service_role','estimates_confirm_guard'));
await db.exec("set role authenticated");
let msg=true; try{ await db.exec("update t set v=100 where id=1"); }catch(e){ msg=e.message; }
await db.exec("reset role");
const st=(await db.query("select stage from t where id=1")).rows[0].stage;
ok('적용 후에도 로그인 사용자의 입금 저장 시 트리거가 정상 발동(자동 단계 이동)', msg===true && st==='선금결제', String(msg)+' stage='+st);
await db.exec("set role authenticated"); let direct=null; try{ await db.query("select public.customers_auto_stage_on_deposit()"); direct='호출됨'; }catch(e){ direct=e.message; } await db.exec("reset role");
ok('적용 후: 로그인 사용자가 함수를 직접 호출하면 권한 오류', /permission denied/.test(String(direct)), String(direct));
await db.exec(fs.readFileSync(R+'2026-10-27_h5_trigger_fn_revoke_rollback.sql','utf8'));
ok('되돌린 뒤: anon·authenticated 실행 권한 복원', await canExec('anon','customers_auto_stage_on_deposit') && await canExec('authenticated','estimates_confirm_guard'));
console.log(out.join('\n')); console.log(out.some(l=>l.startsWith('❌'))?'\n❌ 실패 있음':'\n✅ 모두 통과');
