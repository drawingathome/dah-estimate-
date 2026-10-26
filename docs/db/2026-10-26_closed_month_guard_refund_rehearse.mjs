import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const R='../r/docs/db/';
const db = new PGlite();
const M='00000000-0000-0000-0000-000000000001', S='00000000-0000-0000-0000-000000000002';
await db.exec(`
create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
create table staff_profiles(id uuid primary key, role text);
insert into staff_profiles values ('${M}','master'),('${S}','staff');
create table monthly_close(month text primary key); insert into monthly_close values ('2026-09');
create table customers(id int primary key, date text); insert into customers values (1,'2026-09-12');
create table estimates(id uuid primary key, client_id int, customer_name text, staff_name text, memo text, deposit_date text, deposit_amount numeric, deposit_method text, balance_date text, balance_amount numeric, balance_method text);
insert into estimates values ('11111111-1111-1111-1111-111111111111',1,'시험','마스터','', '2026-09-10',1000000,'카드','2026-09-20',500000,'카드');
create table estimate_extra_payments(id uuid primary key default gen_random_uuid(), estimate_id uuid, amount numeric, paid_date text);
create table payment_refunds(id uuid primary key default gen_random_uuid(), entry_type text, estimate_id uuid, client_id int, customer_name text, staff_name text, slot text, amount numeric, paid_date text, pay_method text, refund_date text, reason text, request_id uuid);
create function register_refund(p_estimate_id uuid, p_slot text, p_amount numeric, p_refund_date text, p_reason text, p_request_id uuid DEFAULT NULL) returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare e record; v_paid_date text; v_method text; v_cur numeric; v_id uuid;
begin
  if not exists (select 1 from public.staff_profiles where id = auth.uid() and role = 'master') then raise exception '환불 등록은 마스터만 할 수 있습니다.' using errcode='42501'; end if;
  select * into e from public.estimates where id = p_estimate_id for update;
  if p_slot = 'deposit' then v_cur := coalesce(e.deposit_amount,0); v_paid_date := e.deposit_date; v_method := e.deposit_method;
  else v_cur := coalesce(e.balance_amount,0); v_paid_date := e.balance_date; v_method := e.balance_method; end if;
  if p_amount > v_cur then raise exception '환불 금액이 입금액보다 큽니다.'; end if;
  insert into public.payment_refunds(entry_type, estimate_id, client_id, customer_name, staff_name, slot, amount, paid_date, pay_method, refund_date, reason, request_id)
    values ('refund', e.id, e.client_id, e.customer_name, e.staff_name, p_slot, p_amount, v_paid_date, v_method, p_refund_date, btrim(p_reason), p_request_id) returning id into v_id;
  if p_slot = 'deposit' then update public.estimates set deposit_amount = v_cur - p_amount where id = e.id;
  else update public.estimates set balance_amount = v_cur - p_amount where id = e.id; end if;
  return v_id;
end $f$;
`);
await db.exec(fs.readFileSync(R+'2026-10-26_closed_month_guard_DRAFT.sql','utf8'));
const out=[]; const ok=(l,c,d)=>out.push((c?'✅ ':'❌ ')+l+(d?' — '+d:''));
async function as(uid, sql){ await db.exec(`select set_config('app.uid','${uid||''}',false)`); try{ await db.exec(sql); return true;}catch(e){ return e.message; } }
let r;
r=await as(M,"select register_refund('11111111-1111-1111-1111-111111111111','deposit',300000,'2026-10-26','변심')"); ok('1. 마스터가 9월 입금을 10월에 환불(현재 환불 함수 그대로, 표시 한 줄 없이)', r===true, String(r));
let d=(await db.query("select deposit_amount::int a from estimates")).rows[0].a; ok('2. 입금액이 1,000,000 → 700,000으로 감액됨', d===700000, String(d));
let n=(await db.query("select count(*)::int c from closed_month_edit_log where tbl='estimates'")).rows[0].c; ok('3. 마감월 입금 감액이 기록으로 남음(1건)', n===1, 'n='+n);
r=await as(S,"select register_refund('11111111-1111-1111-1111-111111111111','balance',100000,'2026-10-26','시도')"); ok('4. 실장은 환불 함수 자체가 거부(권한 2중 방어)', typeof r==='string' && r.includes('마스터만'), String(r));
r=await as(S,"update estimates set balance_amount=1 where id='11111111-1111-1111-1111-111111111111'"); ok('5. 실장이 직접 9월 잔금 수정 시도는 가드가 거부', typeof r==='string' && r.includes('마감된 달'), String(r));
console.log(out.join('\n'));
