// N-113 가짜 DB 예행: 정상 삭제 / 발주 기록(FK 막기)이 있으면 견적서 보존(전부 취소) / 없는 고객·권한 없음 → 견적서 보존 / 다른 고객 영향 없음 / 되돌리기
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const R = new URL('.', import.meta.url).pathname;
const db = new PGlite(); const out = []; const ok = (l, c, d) => out.push((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || '')));
await db.exec(`
create role authenticated; create role anon;
create table public.customers(id bigint primary key, client_name text, staff_name text);
create table public.estimates(id serial primary key, client_id bigint, price numeric);
create table public.dah_purchase_orders(id serial primary key, customer_id bigint not null references public.customers(id) on delete restrict);
grant all on all tables in schema public to authenticated; grant usage on schema public to authenticated, anon;
insert into public.customers values (1,'정상삭제','마스터'),(2,'발주있음','마스터'),(3,'다른고객','마스터'),(4,'실장것','오지은 실장');
insert into public.estimates(client_id,price) values (1,100),(1,200),(2,300),(3,400),(4,500);
insert into public.dah_purchase_orders(customer_id) values (2);
-- 실장은 본인 담당만 지울 수 있는 RLS를 흉내
alter table public.customers enable row level security; alter table public.estimates enable row level security;
create policy c_all on public.customers for all to postgres using (true);
create policy c_master on public.customers for all to authenticated using (staff_name = '마스터');
create policy e_all on public.estimates for all to postgres using (true);
create policy e_master on public.estimates for all to authenticated using (client_id in (select id from public.customers where staff_name='마스터'));
`);
await db.exec(fs.readFileSync(R + '2026-11-05_n113_delete_customer_apply.sql', 'utf8'));
await db.exec('set role authenticated');
const cnt = async (t, w) => (await db.query(`select count(*)::int n from public.${t} where ${w}`)).rows[0].n;
const call = async (id) => { try { const r = await db.query('select public.dah_delete_customer($1) r', [id]); return { ok: true, r: r.rows[0].r }; } catch (e) { return { ok: false, m: e.message }; } };
let r = await call(1);
ok('정상 고객: 견적서 2건·고객 1건이 함께 삭제됨', r.ok && r.r.estimates_deleted === 2 && r.r.customers_deleted === 1 && await cnt('customers', 'id=1') === 0 && await cnt('estimates', 'client_id=1') === 0, JSON.stringify(r));
r = await call(2);
ok('발주 기록이 있는 고객: 오류로 전부 취소 → 견적서 1건과 고객이 그대로 남음(반쪽 삭제 없음)', !r.ok && await cnt('estimates', 'client_id=2') === 1 && await cnt('customers', 'id=2') === 1, JSON.stringify(r));
ok('발주 기록 오류 문구에 제약 이름이 들어옴(앱이 안내문으로 바꿀 수 있음)', !r.ok && /dah_purchase_orders|foreign key|violates/i.test(r.m), r.m);
r = await call(4);
await db.exec('reset role');
const keep4 = await cnt('estimates', 'client_id=4') === 1 && await cnt('customers', 'id=4') === 1; // 관리자 눈으로 다시 세어 '진짜 남아 있는지' 확인
await db.exec('set role authenticated');
ok('권한 없는 고객(실장 몫을 마스터 정책으로 흉내): 오류이고 견적서·고객이 실제로 남아 있음', !r.ok && keep4, JSON.stringify(r) + ' keep=' + keep4);
r = await call(999);
ok('없는 고객 번호: 오류(조용한 성공 아님)', !r.ok, JSON.stringify(r));
ok('다른 고객(3번)의 견적서·고객은 영향 없음', await cnt('estimates', 'client_id=3') === 1 && await cnt('customers', 'id=3') === 1);
await db.exec('reset role');
// 역검증: 옛 방식(견적서 먼저 지우고 고객 따로) = 발주 있는 고객에서 반쪽 삭제 재현
await db.exec('set role authenticated');
await db.exec('delete from public.estimates where client_id=2');
let half = false; try { await db.exec('delete from public.customers where id=2'); } catch (e) { half = true; }
ok('역검증: 옛 방식은 고객 삭제가 막혀도 견적서는 이미 사라짐(= 반쪽 삭제 재현)', half && await cnt('customers', 'id=2') === 1 && await cnt('estimates', 'client_id=2') === 0);
await db.exec('reset role');
await db.exec(fs.readFileSync(R + '2026-11-05_n113_delete_customer_rollback.sql', 'utf8'));
const fn = (await db.query("select count(*)::int n from pg_proc where proname='dah_delete_customer'")).rows[0].n;
ok('되돌린 뒤: 함수가 지워지고 데이터는 그대로', fn === 0 && await cnt('customers', 'id=3') === 1);
console.log(out.join('\n')); const bad = out.some(l => l.startsWith('❌')); console.log(bad ? '\n❌ 실패 있음' : '\n✅ 모두 통과'); process.exit(bad ? 1 : 0);
