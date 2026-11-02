// N-79 ㉠ 예행(가짜 DB): 견적서 삭제 시나리오별 고객 금액 기대값 + 역검증(옛 방식은 사고 재현) + 되돌리기
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const R = new URL('.', import.meta.url).pathname;
const db = new PGlite(); const out = []; const ok = (l, c, d) => out.push((c ? '✅ ' : '❌ ') + l + (d ? ' — ' + d : ''));
await db.exec(`
create table public.customers(id bigint primary key, price bigint default 0, performance_revenue bigint default 0, memo text default '');
create table public.estimates(id uuid primary key default gen_random_uuid(), client_id bigint, price numeric, performance_revenue numeric,
  deposit_amount numeric, balance_amount numeric, is_archived boolean default false, updated_at timestamptz default now(), created_at timestamptz default now());
create table public.estimate_extra_payments(id serial primary key, estimate_id uuid, amount numeric);
create function public.dah_estimate_paid(p uuid) returns numeric language sql stable as $$
  select coalesce(e.deposit_amount,0)+coalesce(e.balance_amount,0)+coalesce((select sum(x.amount) from public.estimate_extra_payments x where x.estimate_id=e.id),0) from public.estimates e where e.id=p $$;
`);
const rb = fs.readFileSync(R + '2026-11-02_n79_delete_recalc_rollback.sql', 'utf8');
const ap = fs.readFileSync(R + '2026-11-02_n79_delete_recalc_apply.sql', 'utf8');
const trig = `create trigger trg_adjust_customer_amounts_on_estimate_delete after delete on public.estimates for each row execute function public.adjust_customer_amounts_on_estimate_delete();`;
let n = 0; const T = (k) => `2026-11-0${1 + (k % 2)} 10:0${k % 10}:00+09`;
async function setup(cid, cprice, cperf, ests, memo = '') {
  await db.query('insert into public.customers(id,price,performance_revenue,memo) values ($1,$2,$3,$4)', [cid, cprice, cperf, memo]);
  const ids = {};
  for (const e of ests) {
    const r = await db.query('insert into public.estimates(client_id,price,performance_revenue,deposit_amount,balance_amount,is_archived,updated_at) values ($1,$2,$3,$4,$5,$6,$7) returning id',
      [cid, e.p, e.r ?? Math.round(e.p * 0.9), e.dep ?? null, e.bal ?? null, e.arch ?? false, e.t]);
    ids[e.k] = r.rows[0].id;
  }
  return ids;
}
const del = (id) => db.query('delete from public.estimates where id=$1', [id]);
const cust = async (id) => (await db.query('select price::int p, performance_revenue::int r from public.customers where id=$1', [id])).rows[0];
async function scenarios(label, expectNew) {
  // 한은실 사고 재현: 가견적 3개(옛 24.6M, 21.3M, 최신 11.9M), 고객 금액 = 최신 11.9M
  const A = await setup(1, 11914000, 10824000, [{ k: 'old', p: 24608000, r: 18837800, t: '2026-10-21 17:00+09' }, { k: 'mid', p: 21325000, r: 15554800, t: '2026-10-23 10:00+09' }, { k: 'new', p: 11914000, r: 10824000, t: '2026-11-02 14:29+09' }]);
  await del(A.old); await del(A.mid); const a = await cust(1);
  ok(label + ' 사고 재현: 옛 가견적 2건 삭제 후 고객 금액', expectNew ? (a.p === 11914000 && a.r === 10824000) : a.p === 0, '금액 ' + a.p + '/성과 ' + a.r);
  if (!expectNew) return;
  // 최신 가견적 삭제 → 그 전 최신으로
  const B = await setup(2, 5000000, 4500000, [{ k: 'a', p: 4000000, r: 3600000, t: '2026-10-01 10:00+09' }, { k: 'b', p: 5000000, r: 4500000, t: '2026-10-02 10:00+09' }]);
  await del(B.b); const b = await cust(2); ok('최신 가견적 삭제 → 남은 가장 최근 견적서 금액(4,000,000)', b.p === 4000000 && b.r === 3600000, JSON.stringify(b));
  await del(B.a); const b2 = await cust(2); ok('마지막 견적서 삭제 → 0', b2.p === 0 && b2.r === 0, JSON.stringify(b2));
  // 입금 있는 견적서(계약 건) 2개 + 가견적 1개
  const C = await setup(3, 8000000, 7000000, [{ k: 'p1', p: 5000000, r: 4500000, dep: 2500000, t: '2026-10-01 10:00+09' }, { k: 'p2', p: 3000000, r: 2500000, dep: 1500000, t: '2026-10-05 10:00+09' }, { k: 'draft', p: 9000000, r: 8000000, t: '2026-10-09 10:00+09' }]);
  await del(C.draft); const c = await cust(3); ok('계약 건 2개 + 가견적 1개: 가견적 삭제 → 계약 합계 유지(8,000,000)', c.p === 8000000 && c.r === 7000000, JSON.stringify(c));
  await del(C.p1); const c2 = await cust(3); ok('계약 건 하나 삭제 → 남은 계약 건 금액(3,000,000)', c2.p === 3000000 && c2.r === 2500000, JSON.stringify(c2));
  // 추가결제만 있는 견적서도 계약 건으로 인정
  const D = await setup(4, 6000000, 5000000, [{ k: 'x', p: 6000000, r: 5000000, t: '2026-10-01 10:00+09' }, { k: 'y', p: 2000000, r: 1800000, t: '2026-10-02 10:00+09' }]);
  await db.query('insert into public.estimate_extra_payments(estimate_id, amount) values ($1, 100000)', [D.x]);
  await del(D.y); const d = await cust(4); ok('추가결제만 있는 견적서도 계약 건: 다른 견적서 삭제 후 그 금액(6,000,000)', d.p === 6000000, JSON.stringify(d));
  // 보관된 견적서 삭제 → 고객 금액 변화 없음
  const E = await setup(5, 7000000, 6000000, [{ k: 'live', p: 7000000, r: 6000000, t: '2026-10-10 10:00+09' }, { k: 'arch', p: 30000000, r: 20000000, arch: true, t: '2026-10-11 10:00+09' }]);
  await del(E.arch); const e = await cust(5); ok('보관된 견적서 삭제 → 금액 변화 없음(7,000,000)', e.p === 7000000 && e.r === 6000000, JSON.stringify(e));
  // 플러그 이관 고객: 건드리지 않음
  const F = await setup(6, 1234567, 1000000, [{ k: 'a', p: 500000, t: '2026-10-01 10:00+09' }, { k: 'b', p: 700000, t: '2026-10-02 10:00+09' }], '플러그에서 이관');
  await del(F.b); const f = await cust(6); ok('플러그 이관 고객: 삭제해도 금액 그대로(직접 고친 값 보존)', f.p === 1234567 && f.r === 1000000, JSON.stringify(f));
  // 다른 고객 금액 영향 없음 + 고객 번호 없는 견적서 삭제 오류 없음
  const G = await setup(7, 111, 99, [{ k: 'a', p: 111, r: 99, t: '2026-10-01 10:00+09' }]);
  await db.query('insert into public.estimates(client_id,price) values (null, 100)'); await db.exec('delete from public.estimates where client_id is null');
  const g = await cust(7); ok('고객 번호 없는 견적서 삭제: 오류 없음, 다른 고객 금액 그대로', g.p === 111 && g.r === 99, JSON.stringify(g));
}
// 1) 옛 방식(= 지금 운영)으로 사고 재현
await db.exec(rb.split('drop function')[0]); await db.exec(trig);
await scenarios('[옛 방식]', false);
// 2) 새 방식
await db.exec('truncate public.estimates, public.customers'); await db.exec(ap);
await scenarios('[새 방식]', true);
// 3) 되돌리기 → 옛 방식 복원, 새 함수 삭제
await db.exec(rb);
const fn = (await db.query("select count(*)::int n from pg_proc where proname='dah_customer_amounts'")).rows[0].n;
ok('되돌린 뒤: 새 계산 함수가 지워짐', fn === 0);
await db.exec('truncate public.estimates, public.customers');
const H = await setup(9, 11914000, 10824000, [{ k: 'old', p: 24608000, t: '2026-10-21 17:00+09' }, { k: 'new', p: 11914000, t: '2026-11-02 14:29+09' }]);
await del(H.old); const h = await cust(9); ok('되돌린 뒤: 옛 동작 복원(=사고 방식으로 돌아감)', h.p === 0, JSON.stringify(h));
console.log(out.join('\n')); const bad = out.some(l => l.startsWith('❌')); console.log(bad ? '\n❌ 실패 있음' : '\n✅ 모두 통과'); process.exit(bad ? 1 : 0);
