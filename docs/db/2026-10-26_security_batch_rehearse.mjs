import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const dir = '../r/docs/db/';
const db = new PGlite();
await db.exec(`
create schema auth; create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
create table staff_profiles(id uuid primary key, role text);
create table app_settings(key text primary key, value jsonb);
create policy x on app_settings for select using (true);
alter table app_settings enable row level security;
create policy app_settings_insert on app_settings for insert with check ((select auth.uid()) is not null);
create table monthly_close(month text primary key, revenue numeric, closed_by uuid);
create table customers(id int primary key); create table estimates(id int primary key);
create function noop() returns trigger language plpgsql as $$ begin return coalesce(NEW,OLD); end $$;
create trigger trg_estimates_confirm_guard before update on estimates for each row execute function noop();
create trigger trg_enforce_estimate_status before update on estimates for each row execute function noop();
insert into app_settings values ('master_pw','"secretvalue"'),('staff_list','[]');
insert into staff_profiles values ('00000000-0000-0000-0000-000000000001','master'),('00000000-0000-0000-0000-000000000002','staff');
insert into monthly_close values ('2026-09', 100, null);
`);
const res = [];
const ok=(l,c,d)=>res.push((c?'✅ ':'❌ ')+l+(d?' — '+d:''));
await db.exec(fs.readFileSync(dir+'2026-10-26_security_batch_apply.sql','utf8'));
ok('1. 적용 성공', true);
ok('2. master_pw 삭제됨', (await db.query("select count(*)::int c from app_settings where key='master_pw'")).rows[0].c===0);
ok('3. 다른 설정 유지', (await db.query("select count(*)::int c from app_settings where key='staff_list'")).rows[0].c===1);
const v=(await db.query("select trigger_name from v_critical_triggers_status order by 1")).rows.map(r=>r.trigger_name);
ok('4. 감시 뷰에 확정 보호 트리거 포함', v.includes('trg_estimates_confirm_guard') && v.includes('trg_enforce_estimate_status'), v.join(','));
await db.exec("update monthly_close set revenue=200 where month='2026-09'");
let h=(await db.query("select action, old_row->>'revenue' r from monthly_close_history")).rows;
ok('5. 재마감(수정) 시 이전 값이 이력에 남음', h.length===1 && h[0].action==='update' && h[0].r==='100', JSON.stringify(h));
await db.exec("delete from monthly_close where month='2026-09'");
h=(await db.query("select action from monthly_close_history order by id")).rows;
ok('6. 삭제도 이력에 남음', h.length===2 && h[1].action==='delete');
// RLS: 정책 확인 (실장/마스터)
await db.exec("create role r_user; grant all on all tables in schema public to r_user; grant usage on schema auth to r_user; grant execute on function auth.uid() to r_user; grant usage on all sequences in schema public to r_user");
await db.exec("set role r_user");
async function tryInsert(uid){ await db.exec(`select set_config('app.uid','${uid}',false)`); try{ await db.exec("insert into app_settings values ('k"+uid.slice(-1)+"','1')"); return true;}catch(e){return false;} }
ok('7. 실장은 설정 새 항목 못 만듦', (await tryInsert('00000000-0000-0000-0000-000000000002'))===false);
ok('8. 마스터는 새 항목 만들 수 있음', (await tryInsert('00000000-0000-0000-0000-000000000001'))===true);
await db.exec("reset role");
await db.exec(fs.readFileSync(dir+'2026-10-26_security_batch_rollback.sql','utf8'));
const v2=(await db.query("select trigger_name from v_critical_triggers_status")).rows.map(r=>r.trigger_name);
ok('9. 되돌리기 후 감시 뷰 원상(확정 보호 제외)', !v2.includes('trg_estimates_confirm_guard') && v2.includes('trg_enforce_estimate_status'));
await db.exec("set role r_user"); await db.exec("select set_config('app.uid','00000000-0000-0000-0000-000000000002',false)");
let again=true; try{ await db.exec("insert into app_settings values ('zz','1')"); }catch(e){again=false}
ok('10. 되돌리기 후 옛 규칙(로그인한 누구나)으로 복귀', again===true);
console.log(res.join('\n')); process.exit(res.some(r=>r.startsWith('❌'))?1:0);
