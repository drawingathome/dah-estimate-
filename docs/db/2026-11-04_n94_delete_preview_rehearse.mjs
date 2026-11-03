import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite(); let ok = 0, fail = 0;
const t = (n, c) => { c ? ok++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
await db.exec(`create table estimates(id uuid primary key, client_id bigint, price bigint, performance_revenue bigint, is_archived boolean default false, paid bigint default 0, updated_at timestamptz, created_at timestamptz default now());
create function public.dah_estimate_paid(p uuid) returns bigint language sql stable as $$ select paid from estimates where id=p $$;`);
// 운영 규칙 함수 원문(N-79 ㉠ apply 파일에서 첫 함수만 추출)
const src = fs.readFileSync(new URL('./2026-11-02_n79_delete_recalc_apply.sql', import.meta.url), 'utf8');
const first = src.slice(src.indexOf('create or replace function public.dah_customer_amounts'), src.indexOf('create or replace function public.adjust_customer_amounts'));
await db.exec(first);
await db.exec(fs.readFileSync(new URL('./2026-11-04_n94_delete_preview_apply.sql', import.meta.url), 'utf8'));
const id = n => `00000000-0000-0000-0000-0000000000${String(n).padStart(2,'0')}`;
const ins = (n,c,p,pr,paid,arch,upd) => db.exec(`insert into estimates(id,client_id,price,performance_revenue,paid,is_archived,updated_at) values ('${id(n)}',${c},${p},${pr},${paid},${arch},'${upd}')`);
// 고객1: 결제된 견적서 2개 + 결제 안 된 1개 / 고객2: 가견적만 3개 / 고객3: 견적 1개 / 고객4: 보관된 견적 포함
await ins(1,1,1000,900,100,false,'2026-10-01'); await ins(2,1,2000,1800,200,false,'2026-10-02'); await ins(3,1,9000,8000,0,false,'2026-10-03');
await ins(4,2,500,450,0,false,'2026-10-01'); await ins(5,2,700,630,0,false,'2026-10-05'); await ins(6,2,300,270,0,false,'2026-10-03');
await ins(7,3,4000,3600,0,false,'2026-10-01');
await ins(8,4,100,90,0,false,'2026-10-01'); await ins(9,4,800,720,0,true,'2026-10-09');
const after = async n => (await db.query(`select * from dah_customer_amounts_after_delete('${id(n)}')`)).rows[0];
const now = async c => (await db.query(`select * from dah_customer_amounts(${c})`)).rows[0];
let r;
r = await after(1); t('1 결제된 견적 1개 삭제 → 남은 결제 견적(2,000)', Number(r.price) === 2000 && Number(r.performance_revenue) === 1800);
r = await after(3); t('2 결제 안 된 견적 삭제 → 결제된 합 유지(3,000)', Number(r.price) === 3000);
r = await after(5); t('3 가견적만 있는 고객: 최신 삭제 → 그다음 최신(300)', Number(r.price) === 300);
r = await after(4); t('4 가견적: 옛 것 삭제 → 최신 유지(700)', Number(r.price) === 700);
r = await after(7); t('5 마지막 견적 삭제 → 0원', Number(r.price) === 0);
r = await after(8); t('6 보관된 견적은 계산에서 제외(삭제 후 0)', Number(r.price) === 0);
r = await after(9); t('7 보관된 견적을 삭제해도 현재 활성 견적 유지(100)', Number(r.price) === 100);
t('8 없는 견적서 번호 → 결과 없음', (await db.query(`select * from dah_customer_amounts_after_delete('${id(99)}')`)).rows.length === 0);
// 일치 검사: 삭제할 대상이 아닌 견적을 지정해도 두 함수가 같은 규칙인지(현재값과 비교하려고, 대상을 먼저 보관 처리한 뒤 실제 함수와 비교)
for (const [n,c] of [[1,1],[2,1],[3,1],[5,2],[6,2],[7,3]]) {
  const pv = await after(n);
  await db.exec(`update estimates set is_archived=true where id='${id(n)}'`);
  const real = await now(c);
  t(`일치 견적${n}: 미리보기 = 실제 재계산`, Number(pv.price) === Number(real.price) && Number(pv.performance_revenue) === Number(real.performance_revenue));
  await db.exec(`update estimates set is_archived=false where id='${id(n)}'`);
}
await db.exec(fs.readFileSync(new URL('./2026-11-04_n94_delete_preview_rollback.sql', import.meta.url), 'utf8'));
t('되돌리기 후 함수 없음', (await db.query(`select count(*)::int n from pg_proc where proname='dah_customer_amounts_after_delete'`)).rows[0].n === 0);
console.log(`\n${ok} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
