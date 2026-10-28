// N-26 integrity_ack 가짜 DB(PGlite) 예행. 운영 DB 연결 없음. 가짜 DB 통과 = "시험 통과"일 뿐 "운영 확인" 아님.
// 실행: (pglite가 보이는 폴더에서) node 2026-10-28_integrity_ack_rehearse.mjs
// 역검증용: APPLY_SQL=<깨뜨린 적용 파일 경로> 로 실행하면 그 파일로 예행한다.
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const D = path.dirname(fileURLToPath(import.meta.url));
const applyPath = process.env.APPLY_SQL || path.join(D, '2026-10-28_integrity_ack_apply.sql');
const rollbackPath = path.join(D, '2026-10-28_integrity_ack_rollback.sql');
const MASTER = '00000000-0000-0000-0000-000000000001', STAFF = '00000000-0000-0000-0000-000000000002';
const db = new PGlite(); const out = [];
const ok = (l, c, d) => out.push((c ? '✅ ' : '❌ ') + l + (d ? ' — ' + d : ''));
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table public.staff_profiles(id uuid primary key, role text);
insert into public.staff_profiles values ('${MASTER}','master'),('${STAFF}','staff');
create table public.customers(id bigint primary key, client_name text);
insert into public.customers values (101,'가'),(102,'나');
grant select on public.staff_profiles, public.customers to anon, authenticated;
-- 운영(Supabase)은 새 표에 anon/authenticated 권한을 기본으로 열어 줌 → 같은 조건으로 재현
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
`);
await db.exec(fs.readFileSync(applyPath, 'utf8'));
ok('0. 적용 SQL 실행 성공', true);
// 역할 전환 도우미: who = 'master' | 'staff' | 'anon' | 'authnull'(로그인했지만 사용자 번호 없음)
const as = async (who, fn) => {
  const uid = who === 'master' ? MASTER : who === 'staff' ? STAFF : '';
  await db.exec(`select set_config('app.uid','${uid}',false)`);
  await db.exec(`set role ${who === 'anon' ? 'anon' : 'authenticated'}`);
  try { return await fn(); } finally { await db.exec('reset role'); }
};
const tryRun = async (who, sql) => { try { const r = await as(who, () => db.query(sql)); return { ok: true, rows: r.rows, n: r.affectedRows }; } catch (e) { return { ok: false, err: e.message }; } };
const ins = (cust, code, uidExpr = 'auth.uid()') => `insert into public.integrity_ack(code,customer_id,acked_by,expires_at,reason) values ('${code}',${cust},${uidExpr},now()+interval '7 days','확인')`;
const total = async () => (await db.query('select count(*)::int c from public.integrity_ack')).rows[0].c;

// 1. 마스터 허용
let r = await tryRun('master', ins(101, 'OVERPAID'));
ok('1-a. 마스터: 확인 기록 추가 허용', r.ok && await total() === 1, r.err);
r = await tryRun('master', 'select code from public.integrity_ack');
ok('1-b. 마스터: 읽기 허용', r.ok && r.rows.length === 1, r.err);
r = await tryRun('master', "update public.integrity_ack set expires_at = now()+interval '30 days', reason='재확인' where code='OVERPAID' and customer_id=101");
ok('1-c. 마스터: 기한 연장(UPDATE) 허용', r.ok && (await db.query("select reason from public.integrity_ack")).rows[0].reason === '재확인', r.err);
r = await tryRun('master', ins(101, 'NO_STAFF', `'${STAFF}'`));
ok('1-d. 마스터라도 남의 이름(acked_by)으로는 기록 불가', !r.ok, r.err);
r = await tryRun('master', "insert into public.integrity_ack(code,customer_id,expires_at) values ('X',102,now()-interval '1 day')");
ok('1-e. 기한이 확인 시각보다 과거면 거부(check)', !r.ok, r.err);

// 2. 실장 거부
const before = await total();
r = await tryRun('staff', ins(102, 'OVERPAID'));
ok('2-a. 실장: 추가 거부', !r.ok && await total() === before, r.err);
r = await tryRun('staff', 'select * from public.integrity_ack');
ok('2-b. 실장: 읽기 시 0줄(마스터 기록이 있어도 안 보임)', r.ok && r.rows.length === 0, r.err || ('rows=' + (r.rows||[]).length));
r = await tryRun('staff', "update public.integrity_ack set reason='실장수정'");
ok('2-c. 실장: 수정 0줄 반영', (r.ok ? r.n === 0 : true) && (await db.query("select reason from public.integrity_ack")).rows[0].reason === '재확인', r.err);
r = await tryRun('staff', 'delete from public.integrity_ack');
ok('2-d. 실장: 삭제 불가(기록 그대로)', await total() === before, r.err);

// 3. 로그인 안 한 사람 거부
r = await tryRun('anon', ins(102, 'OVERPAID', 'null'));
ok('3-a. 비로그인(anon): 추가 거부', !r.ok && await total() === before, r.err);
r = await tryRun('anon', 'select * from public.integrity_ack');
ok('3-b. 비로그인(anon): 읽기 거부(권한 오류 또는 0줄)', !r.ok || r.rows.length === 0, r.err || 'rows=0');
r = await tryRun('authnull', ins(102, 'OVERPAID', 'null'));
ok('3-c. 사용자 번호 없는 로그인 토큰: 추가 거부', !r.ok && await total() === before, r.err);

// 4. 같은 경고 중복 확인 방지
r = await tryRun('master', ins(101, 'OVERPAID'));
ok('4-a. 같은 (경고종류, 고객) 두 번째 확인은 거부', !r.ok && /duplicate|unique/i.test(r.err || '') && await total() === before, r.err);
r = await tryRun('master', ins(101, 'MULTI_FINAL'));
ok('4-b. 같은 고객의 다른 경고 종류는 허용', r.ok, r.err);
r = await tryRun('master', ins(102, 'OVERPAID'));
ok('4-c. 같은 경고 종류의 다른 고객은 허용', r.ok, r.err);
await db.exec('delete from public.customers where id=102');
ok('4-d. 고객이 삭제되면 그 고객의 확인 기록도 함께 삭제(cascade)', (await db.query('select count(*)::int c from public.integrity_ack where customer_id=102')).rows[0].c === 0);

// 5. 되돌리기 후 표 없음
await db.exec(fs.readFileSync(rollbackPath, 'utf8'));
const ex = (await db.query("select to_regclass('public.integrity_ack') t")).rows[0].t;
const pol = (await db.query("select count(*)::int c from pg_policies where tablename='integrity_ack'")).rows[0].c;
ok('5-a. 되돌린 뒤 integrity_ack 표 없음', ex === null, String(ex));
ok('5-b. 되돌린 뒤 규칙(policy)도 없음', pol === 0);
ok('5-c. 되돌린 뒤 기존 표(customers, staff_profiles)는 그대로', (await db.query('select count(*)::int c from public.customers')).rows[0].c === 1 && (await db.query('select count(*)::int c from public.staff_profiles')).rows[0].c === 2);
await db.exec(fs.readFileSync(rollbackPath, 'utf8'));
ok('5-d. 되돌리기를 한 번 더 실행해도 오류 없음', true);
await db.exec(fs.readFileSync(applyPath, 'utf8'));
ok('5-e. 되돌린 뒤 다시 적용 가능', (await db.query("select to_regclass('public.integrity_ack') t")).rows[0].t !== null);

console.log(out.join('\n'));
const bad = out.filter(l => l.startsWith('❌')).length;
console.log(`\n통과 ${out.length - bad} / 실패 ${bad} / 전체 ${out.length}`);
process.exit(bad ? 1 : 0);
