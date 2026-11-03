// N-73 2단계 예행(가짜 DB): 자동 이동(기록전용/켜짐)·제외·자동 복귀·기록·되돌리기
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const R = new URL('.', import.meta.url).pathname;
const db = new PGlite(); const out = []; const ok = (l, c, d) => out.push((c ? '✅ ' : '❌ ') + l + (d ? ' — ' + d : ''));
await db.exec(`create role anon; create role authenticated;
create table public.customers(id bigint primary key, stage text, deposit_amount numeric default 0, is_archived boolean default false,
  lead_parked boolean default false, memo text, measure_date text default '', install_date text default '', created_at timestamptz default now(), updated_at timestamptz default now());
create table public.estimates(id serial primary key, client_id bigint, is_archived boolean default false, deposit_amount numeric default 0, balance_amount numeric default 0, price numeric default 0, updated_at timestamptz default now());
create table public.app_settings(key text primary key, value jsonb);
create table public.customer_stage_auto_log(id bigserial primary key, customer_id bigint not null, from_stage text, to_stage text not null, reason text not null, changed_by uuid, changed_at timestamptz not null default now());
create function public.dah_recheck_customer_stage(p bigint) returns void language sql as $$ select $$;
`);
await db.exec(fs.readFileSync(R + '2026-11-03_n73_stale_leads_candidates_apply.sql', 'utf8'));
// 원래 트리거 함수 + 트리거 (되돌리기 파일이 원래 함수를 복원하므로 먼저 그것으로 시작)
await db.exec(fs.readFileSync(R + '2026-11-03_n73_auto_park_rollback.sql', 'utf8').split('-- 예약')[0].replace('drop function if exists public.dah_park_stale_leads(int);', '').replace("delete from public.app_settings where key = 'lead_park_mode';", ''));
await db.exec(`create trigger trg_estimates_recheck_stage after insert or update of deposit_amount, balance_amount, price, is_archived, client_id on public.estimates for each row execute function public.dah_estimates_recheck_stage();`);
const ago = d => `now() - interval '${d} days'`;
const cust = (id, stage, o = {}) => db.query(`insert into public.customers(id,stage,deposit_amount,is_archived,lead_parked,memo,created_at) values ($1,$2,$3,$4,$5,$6,${ago(o.created ?? 100)})`, [id, stage, o.dep ?? 0, o.arch ?? false, o.park ?? false, o.memo ?? '']);
const est = (cid, d) => db.query(`insert into public.estimates(client_id,updated_at) values ($1,${ago(d)})`, [cid]);
await cust(1, '가견적'); await est(1, 40);            // 오래됨 → 이동
await cust(2, '상담'); await est(2, 10);              // 최근 → 유지
await cust(3, '가견적', { dep: 100000 }); await est(3, 60); // 입금 → 제외
await cust(4, '상담', { memo: '플러그' }); await est(4, 60); // 플러그 → 제외
const parked = async () => (await db.query('select id from public.customers where lead_parked order by id')).rows.map(r => Number(r.id));
const logs = async (like) => (await db.query('select count(*)::int n from public.customer_stage_auto_log where reason like $1', [like])).rows[0].n;
await db.exec(fs.readFileSync(R + '2026-11-03_n73_auto_park_apply.sql', 'utf8'));
await db.exec(`update public.app_settings set value='"shadow"' where key='lead_park_mode'`);
let n = Number((await db.query('select public.dah_park_stale_leads(30) n')).rows[0].n);
ok('기록전용: 1명만 기록하고 실제로는 안 옮김', n === 1 && (await parked()).length === 0 && (await logs('[기록전용] 대기 리드%')) === 1);
await db.query('select public.dah_park_stale_leads(30)');
ok('기록전용을 또 돌려도 같은 기록이 쌓이지 않음', (await logs('[기록전용] 대기 리드%')) === 1);
await db.exec(`update public.app_settings set value='"on"' where key='lead_park_mode'`);
n = Number((await db.query('select public.dah_park_stale_leads(30) n')).rows[0].n);
ok('켜짐: 1번(오래됨)만 대기 리드로 이동', n === 1 && JSON.stringify(await parked()) === '[1]', JSON.stringify(await parked()));
ok('입금·플러그·최근 고객은 안 옮겨짐', !(await parked()).some(i => [2, 3, 4].includes(i)));
ok('이동 기록이 남음', (await logs('대기 리드 자동 이동%')) === 1);
n = Number((await db.query('select public.dah_park_stale_leads(30) n')).rows[0].n);
ok('또 돌려도 중복 이동·중복 기록 없음', n === 0 && (await logs('대기 리드 자동 이동%')) === 1);
await db.query('update public.estimates set updated_at = now() where client_id = 1');
ok('수정 시각만 바뀌고 금액·입금은 그대로면 복귀 안 함(기존 트리거 대상 열 기준)', (await parked()).length === 1);
await db.query('update public.estimates set price = 1234000 where client_id = 1');
ok('견적 금액이 바뀌면 자동 복귀', (await parked()).length === 0);
await db.query('update public.customers set lead_parked = true where id = 1');
await db.query('insert into public.estimates(client_id) values (1)');
ok('새 견적서가 생기면 자동 복귀', (await parked()).length === 0);
ok('복귀 기록이 남음', (await logs('대기 리드 자동 복귀%')) === 2);
await db.query('update public.customers set lead_parked = true where id = 1');
await db.query("insert into public.estimates(client_id,is_archived) values (1,true)");
ok('보관된 견적서가 생겨도 복귀 안 함', (await parked()).length === 1);
await db.exec(fs.readFileSync(R + '2026-11-03_n73_auto_park_rollback.sql', 'utf8').split('-- 예약')[0]);
const fnGone = (await db.query("select count(*)::int n from pg_proc where proname='dah_park_stale_leads'")).rows[0].n === 0;
await db.query('update public.customers set lead_parked = true where id = 1');
await db.query('insert into public.estimates(client_id) values (1)');
ok('되돌린 뒤: 함수·스위치 제거, 자동 복귀 없음', fnGone && (await parked()).length === 1 && (await db.query("select count(*)::int n from public.app_settings where key='lead_park_mode'")).rows[0].n === 0);
console.log(out.join('\n')); const bad = out.some(l => l.startsWith('❌')); console.log(bad ? '\n❌ 실패 있음' : '\n✅ 모두 통과'); process.exit(bad ? 1 : 0);
