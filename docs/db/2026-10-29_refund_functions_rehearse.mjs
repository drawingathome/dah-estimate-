// H-34③: 환불 등록·취소 DB 함수 자체의 경우의 수 시험 — 운영 함수 본문 그대로(2026-10-29_refund_functions_prod_copy.sql) + 가짜 DB(PGlite).
// 한계: 표(estimates·payment_refunds)는 함수가 쓰는 칸만 있는 단순판, auth.uid()는 모사(app.uid). 운영 DB에서 실행한 것이 아님(운영 확인 아님).
// 역검증: FUNCS_SQL=<깨뜨린 파일> 로 실행. 실행: pglite가 보이는 폴더에서 node 이 파일.
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const D = path.dirname(fileURLToPath(import.meta.url));
const funcs = fs.readFileSync(process.env.FUNCS_SQL || path.join(D, '2026-10-29_refund_functions_prod_copy.sql'), 'utf8');
const M = '00000000-0000-0000-0000-000000000001', S = '00000000-0000-0000-0000-000000000002';
const E1 = '11111111-1111-1111-1111-111111111111';
const db = new PGlite(); const out = []; const ok = (l, c, d) => out.push((c ? '✅ ' : '❌ ') + l + (c || d === undefined ? '' : ' — ' + d));
await db.exec(`
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
create table public.staff_profiles(id uuid primary key, role text);
insert into public.staff_profiles values ('${M}','master'),('${S}','staff');
create table public.estimates(id uuid primary key, client_id bigint, customer_name text, staff_name text,
  deposit_amount numeric, deposit_date text, deposit_method text, balance_amount numeric, balance_date text, balance_method text);
create table public.payment_refunds(id uuid primary key default gen_random_uuid(), entry_type text not null default 'refund', reverses_id uuid, estimate_id uuid not null,
  client_id bigint, customer_name text, staff_name text, slot text not null, amount numeric not null, paid_date text not null, pay_method text,
  refund_date text not null, reason text not null, request_id uuid, created_by uuid, created_at timestamptz not null default now());
`);
await db.exec(funcs);
const reset = async () => { await db.exec(`delete from public.payment_refunds; delete from public.estimates;
  insert into public.estimates values ('${E1}',7,'시험','스태프',700000,'2026-09-20','카드',300000,'2026-10-01','계좌');`); };
const as = async (uid, sql, params) => { await db.exec(`select set_config('app.uid','${uid}',false)`); try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } };
const est = async () => (await db.query(`select deposit_amount::int d, deposit_date dd, deposit_method dm, balance_amount::int b, balance_date bd, balance_method bm from public.estimates where id='${E1}'`)).rows[0];
const cnt = async () => (await db.query('select count(*)::int c from public.payment_refunds')).rows[0].c;
const reg = (slot, amt, date, reason, req) => as(M, 'select public.register_refund($1,$2,$3,$4,$5,$6) id', [E1, slot, amt, date, reason, req || null]);
const rev = (id, reason, req) => as(M, 'select public.reverse_refund($1,$2,$3) id', [id, reason, req || null]);

await reset(); let r;
r = await as(S, 'select public.register_refund($1,$2,$3,$4,$5,$6)', [E1, 'deposit', 1000, '2026-10-05', '사유', null]);
ok('1-a. 실장(마스터 아님): 환불 등록 거부', !r.ok && /마스터만/.test(r.err), r.err);
r = await as('', 'select public.register_refund($1,$2,$3,$4,$5,$6)', [E1, 'deposit', 1000, '2026-10-05', '사유', null]);
ok('1-b. 로그인 안 한 요청: 환불 등록 거부', !r.ok && /마스터만/.test(r.err), r.err);
ok('1-c. 거부된 요청은 아무것도 안 바꿈', await cnt() === 0 && (await est()).d === 700000);

r = await reg('deposit', 200000, '2026-10-05', ' 고객 변심 ');
let e = await est();
ok('2. 부분 환불(선금 20만): 선금 50만·입금일 유지, 기록 1건', r.ok && e.d === 500000 && e.dd === '2026-09-20' && e.dm === '카드' && await cnt() === 1, JSON.stringify(e));
const refId = r.rows?.[0]?.id;
ok('2-b. 사유 앞뒤 공백 제거되어 저장', (await db.query('select reason from public.payment_refunds limit 1')).rows[0].reason === '고객 변심');

r = await reg('deposit', 500000, '2026-10-06', '나머지 전액');
e = await est();
ok('3. 남은 선금 전액 환불: 선금 0, 입금일·방법 비워짐', r.ok && e.d === 0 && e.dd === '' && e.dm === '', JSON.stringify(e));

await reset();
r = await reg('deposit', 700001, '2026-10-05', '초과'); ok('4. 입금액보다 큰 환불 거부', !r.ok && /보다 큽니다/.test(r.err), r.err);
r = await reg('deposit', 1000, '2026-09-19', '일자'); ok('5. 입금일보다 빠른 환불일 거부', !r.ok && /빠를 수 없습니다/.test(r.err), r.err);
r = await reg('deposit', 1000, '2026-10-05', '   '); ok('6. 사유가 공백뿐이면 거부', !r.ok && /사유/.test(r.err), r.err);
r = await reg('deposit', 0, '2026-10-05', '영'); ok('7. 0원 환불 거부', !r.ok && /0보다/.test(r.err), r.err);
r = await reg('deposit', -5, '2026-10-05', '음수'); ok('7-b. 음수 환불 거부', !r.ok, r.err);
r = await reg('other', 1000, '2026-10-05', '칸'); ok('8. 알 수 없는 칸 거부', !r.ok && /칸/.test(r.err), r.err);
r = await reg('deposit', 1000, '2026/10/05', '형식'); ok('9. 날짜 형식이 다르면 거부', !r.ok && /환불일/.test(r.err), r.err);
await db.exec(`update public.estimates set deposit_date='' where id='${E1}'`);
r = await reg('deposit', 1000, '2026-10-05', '입금일없음'); ok('10. 입금일이 없는 입금은 환불 거부', !r.ok && /입금일부터/.test(r.err), r.err);
r = await as(M, 'select public.register_refund($1,$2,$3,$4,$5,$6)', ['22222222-2222-2222-2222-222222222222', 'deposit', 1000, '2026-10-05', '없음', null]); ok('11. 없는 견적서 거부', !r.ok && /찾을 수 없습니다/.test(r.err), r.err);
ok('11-b. 위 거부들은 모두 기록·금액을 바꾸지 않음', await cnt() === 0 && (await est()).d === 700000);

await reset(); const RQ = '33333333-3333-3333-3333-333333333333';
r = await reg('balance', 100000, '2026-10-10', '잔금 일부', RQ); const id1 = r.rows?.[0]?.id;
r = await reg('balance', 100000, '2026-10-10', '잔금 일부', RQ); const id2 = r.rows?.[0]?.id;
ok('12. 같은 요청번호로 두 번 보내도 한 번만 처리(같은 기록 번호 반환)', id1 && id1 === id2 && await cnt() === 1 && (await est()).b === 200000, JSON.stringify(await est()));

await reset(); r = await reg('deposit', 700000, '2026-10-05', '선금 전액'); const full = r.rows?.[0]?.id;
r = await rev(full, '  환불 취소  '); e = await est();
ok('13. 전액 환불 취소: 선금 70만·입금일·방법 복구', r.ok && e.d === 700000 && e.dd === '2026-09-20' && e.dm === '카드', JSON.stringify(e) + (r.err || ''));
r = await rev(full, '또'); ok('14. 이미 취소된 환불을 또 취소하면 거부', !r.ok && /이미 취소/.test(r.err), r.err);
const revRow = (await db.query("select id from public.payment_refunds where entry_type='reversal'")).rows[0];
r = await rev(revRow.id, '취소의 취소'); ok('15. 취소 기록 자체를 되돌리려 하면 거부', !r.ok && /찾을 수 없습니다/.test(r.err), r.err);

await reset(); r = await reg('deposit', 700000, '2026-10-05', '전액'); const f2 = r.rows[0].id;
await db.exec(`update public.estimates set deposit_amount=300000, deposit_date='2026-10-20', deposit_method='현금' where id='${E1}'`);
r = await rev(f2, '취소 시도'); e = await est();
ok('17. 환불 뒤 다른 날짜로 새 입금이 생겼으면 취소 거부, 새 입금 불변', !r.ok && /새 입금/.test(r.err) && e.d === 300000 && e.dd === '2026-10-20', JSON.stringify(e) + r.err);

await reset(); r = await reg('deposit', 100000, '2026-10-05', '일부'); const f3 = r.rows[0].id;
r = await as(M, 'select public.reverse_refund($1,$2,$3)', [f3, '   ', null]); ok('18. 취소 사유가 공백뿐이면 거부', !r.ok && /취소 사유/.test(r.err), r.err);
r = await as(S, 'select public.reverse_refund($1,$2,$3)', [f3, '사유', null]); ok('19. 실장은 환불 취소도 불가', !r.ok && /마스터만/.test(r.err), r.err);
r = await reg('balance', 300000, '2026-10-10', '잔금 전액'); const f4 = r.rows[0].id;
e = await est(); ok('20. 잔금 전액 환불: 잔금 0·잔금일·방법 비워짐, 선금은 그대로(60만)', e.b === 0 && e.bd === '' && e.bm === '' && e.d === 600000, JSON.stringify(e));
r = await rev(f4, '잔금 취소'); e = await est(); ok('21. 잔금 환불 취소: 잔금 30만·잔금일·방법 복구', r.ok && e.b === 300000 && e.bd === '2026-10-01' && e.bm === '계좌', JSON.stringify(e));
const sum = (await db.query("select sum(case when entry_type='refund' then -amount else amount end)::int s from public.payment_refunds")).rows[0].s;
ok('22. 기록 합계가 금액 변화와 일치(환불 −, 취소 +: 선금 −10만 환불 상태 = −100000)', sum === -100000, String(sum));

console.log(out.join('\n')); const bad = out.filter(x => x.startsWith('❌')).length;
console.log(bad ? `\n❌ 실패 ${bad}건` : '\n✅ 모두 통과(가짜 DB·운영 함수 본문 복사 — 운영 확인 아님)'); process.exit(bad ? 1 : 0);
