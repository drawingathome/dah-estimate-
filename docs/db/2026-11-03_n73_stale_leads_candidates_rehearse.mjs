// N-73 1단계 예행(가짜 DB): 후보 선별 규칙·제외 조건·읽기 전용 확인·되돌리기
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const R = new URL('.', import.meta.url).pathname;
const db = new PGlite(); const out = []; const ok = (l, c, d) => out.push((c ? '✅ ' : '❌ ') + l + (d ? ' — ' + d : ''));
await db.exec(`
create table public.customers(id bigint primary key, stage text, deposit_amount numeric default 0, is_archived boolean default false,
  lead_parked boolean default false, memo text, measure_date text default '', install_date text default '', created_at timestamptz default now(), updated_at timestamptz default now());
create table public.estimates(id serial primary key, client_id bigint, is_archived boolean default false, updated_at timestamptz default now());`);
const ago = d => `now() - interval '${d} days'`;
const cust = (id, stage, o = {}) => db.query(`insert into public.customers(id,stage,deposit_amount,is_archived,lead_parked,memo,measure_date,install_date,created_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,${ago(o.created ?? 100)},now())`,
  [id, stage, o.dep ?? 0, o.arch ?? false, o.park ?? false, o.memo ?? '', o.mdate ?? '', o.idate ?? '']);
const est = (cid, d, arch = false) => db.query(`insert into public.estimates(client_id,is_archived,updated_at) values ($1,$2,${ago(d)})`, [cid, arch]);
await cust(1, '상담'); await est(1, 40);                       // 40일 전 견적 → 후보
await cust(2, '가견적'); await est(2, 10);                     // 10일 전 → 아님
await cust(3, '방문예약', { created: 50 });                    // 견적 없음, 50일 전 등록 → 후보
await cust(4, '상담', { dep: 100000 }); await est(4, 60);      // 선금 → 제외
await cust(5, '상담', { memo: '플러그에서 이관' }); await est(5, 60); // 플러그 제외
await cust(6, '상담', { arch: true }); await est(6, 60);       // 보관 제외
await cust(7, '상담', { park: true }); await est(7, 60);       // 이미 대기 리드 제외
await cust(8, '상담', { mdate: '2999-01-01' }); await est(8, 60); // 미래 실측 제외
await cust(9, '선금결제'); await est(9, 60);                   // 다른 단계 제외
await cust(10, '가견적'); await est(10, 60, true); await est(10, 5); // 오래된 보관 견적 + 최근 활성 견적 → 아님
await cust(11, '가견적'); await est(11, 20);                   // 20일: 14일 기준에는 후보, 30일 기준에는 아님
await cust(12, '상담', { created: 5 });                         // 5일 전 등록, 견적 없음 → 아님
const ids = async d => (await db.query('select customer_id from public.dah_stale_lead_candidates($1) order by 1', [d])).rows.map(r => Number(r.customer_id));
let before = (await db.query('select md5(string_agg(c::text, \'|\' order by id)) h from public.customers c')).rows[0].h;
await db.exec(fs.readFileSync(R + '2026-11-03_n73_stale_leads_candidates_apply.sql', 'utf8'));
const d30 = await ids(30), d14 = await ids(14);
ok('30일 기준 후보 = 1, 3', JSON.stringify(d30) === '[1,3]', JSON.stringify(d30));
ok('14일 기준 후보 = 1, 3, 11', JSON.stringify(d14) === '[1,3,11]', JSON.stringify(d14));
ok('선금·플러그·보관·대기리드·미래실측·다른 단계 제외', ![4,5,6,7,8,9].some(i => d14.includes(i)));
ok('최근 활성 견적이 있으면(오래된 보관 견적 무시) 후보 아님', !d14.includes(10));
ok('최근 등록 고객 후보 아님', !d14.includes(12));
let after = (await db.query('select md5(string_agg(c::text, \'|\' order by id)) h from public.customers c')).rows[0].h;
ok('고객 데이터는 전혀 바뀌지 않음(읽기 전용)', before === after);
await db.exec(fs.readFileSync(R + '2026-11-03_n73_stale_leads_candidates_rollback.sql', 'utf8'));
const gone = (await db.query("select count(*)::int n from pg_proc where proname='dah_stale_lead_candidates'")).rows[0].n === 0;
ok('되돌리기 후 함수 없음', gone);
console.log(out.join('\n')); const bad = out.some(l => l.startsWith('❌')); console.log(bad ? '\n❌ 실패 있음' : '\n✅ 모두 통과'); process.exit(bad ? 1 : 0);
