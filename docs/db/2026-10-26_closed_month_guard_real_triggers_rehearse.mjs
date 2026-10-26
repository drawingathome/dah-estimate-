// H-16(2026-10-26 야간): 마감월 가드를 "운영 DB에서 직접 읽어온 실제 트리거·함수 본문"과 함께 돌려 본다.
// 운영 읽기만 했고 아무것도 바꾸지 않았다(트리거 정의: pg_get_triggerdef, 함수 본문: pg_get_functiondef).
// 확인 목적: ①가드가 기존 입금 보호 트리거보다 먼저 실행되는지(이름순) ②기존 보호 동작·문구가 그대로인지 ③마감월 문구가 우선인지.
// 한계: 표 구조는 시험에 필요한 칸만 단순화(실제 표와 완전히 같지 않음), AFTER 트리거(고객 동기화 등)는 포함하지 않음.
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const R = new URL('.', import.meta.url).pathname.includes('scratchpad/pg') ? '/tmp/claude-0/-home-claude/45e3027c-d643-5179-9db1-f71ebf1949ca/scratchpad/r/docs/db/' : new URL('.', import.meta.url).pathname;
const db = new PGlite();
const M = '00000000-0000-0000-0000-000000000001', S = '00000000-0000-0000-0000-000000000002';
await db.exec(`
create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
create table staff_profiles(id uuid primary key, role text, display_name text);
insert into staff_profiles values ('${M}','master','마스터'),('${S}','staff','실장');
create table monthly_close(month text primary key); insert into monthly_close values ('2026-09');
create table customers(id int primary key, date text); insert into customers values (1,'2026-09-12'),(2,'2026-10-12');
create table estimate_confirm_log(id bigserial primary key, estimate_id uuid, client_id int, action text, reason text, confirmed_at_before timestamptz, confirmed_at_after timestamptz);
create table estimates(id uuid primary key default gen_random_uuid(), client_id int, staff_name text, memo text,
  deposit_date text, deposit_amount numeric, balance_date text, balance_amount numeric, is_archived boolean,
  confirmed_at timestamptz, unconfirm_reason text, estimate_status text, updated_at timestamptz default now());
create table estimate_extra_payments(id uuid primary key default gen_random_uuid(), estimate_id uuid, amount numeric, paid_date text);
-- ── 운영에서 읽어온 실제 함수 본문 ──
create or replace function public.enforce_estimate_status_from_confirmed_at() returns trigger language plpgsql set search_path to 'public','pg_temp' as $f$
begin new.estimate_status := case when new.confirmed_at is not null then 'final' else 'ga' end; return new; end; $f$;
create or replace function public.update_updated_at() returns trigger language plpgsql set search_path to 'public' as $f$
begin new.updated_at = now(); return new; end; $f$;
create or replace function public.estimates_confirm_guard() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare v_reason text;
begin
  if TG_OP = 'UPDATE' and OLD.confirmed_at is distinct from NEW.confirmed_at then
    v_reason := nullif(btrim(coalesce(NEW.unconfirm_reason, '')), '');
    if OLD.confirmed_at is not null and NEW.confirmed_at is null then
      if auth.uid() is not null and v_reason is null then raise exception '확정 해제에는 사유가 필요합니다.' using errcode = '42501'; end if;
      insert into public.estimate_confirm_log(estimate_id, client_id, action, reason, confirmed_at_before, confirmed_at_after) values (OLD.id, OLD.client_id, 'unconfirm', coalesce(v_reason, '(관리자 작업)'), OLD.confirmed_at, NEW.confirmed_at);
    elsif NEW.confirmed_at is not null then
      insert into public.estimate_confirm_log(estimate_id, client_id, action, reason, confirmed_at_before, confirmed_at_after) values (OLD.id, OLD.client_id, 'confirm', null, OLD.confirmed_at, NEW.confirmed_at);
    end if;
  end if;
  if TG_OP = 'UPDATE' then NEW.unconfirm_reason := null; end if;
  return NEW;
end $f$;
create or replace function public.guard_archived_estimate_payment() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
begin
  if auth.uid() is null then return NEW; end if;
  if coalesce(NEW.is_archived, false) = true and coalesce(OLD.is_archived, false) = true then
    if coalesce(NEW.deposit_amount,0) is distinct from coalesce(OLD.deposit_amount,0) or coalesce(NEW.balance_amount,0) is distinct from coalesce(OLD.balance_amount,0) then
      raise exception '보관 처리된 견적서에는 입금을 기록할 수 없습니다. 보관을 먼저 해제해 주세요.' using errcode = '42501';
    end if;
  end if;
  return NEW;
end $f$;
create or replace function public.guard_payment_reduction() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare v_role text;
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then return NEW; end if;
  select role into v_role from public.staff_profiles where id = auth.uid();
  if v_role = 'master' then return NEW; end if;
  if coalesce(NEW.deposit_amount,0) < coalesce(OLD.deposit_amount,0) or coalesce(NEW.balance_amount,0) < coalesce(OLD.balance_amount,0) then
    raise exception '이미 기록된 입금액은 줄이거나 지울 수 없습니다. 환불·정정은 마스터에게 요청해 주세요.' using errcode='42501'; end if;
  if TG_TABLE_NAME = 'estimates' then
    if coalesce(OLD.deposit_amount,0) > 0 and coalesce(OLD.deposit_date,'') <> '' and NEW.deposit_date is distinct from OLD.deposit_date
       or coalesce(OLD.balance_amount,0) > 0 and coalesce(OLD.balance_date,'') <> '' and NEW.balance_date is distinct from OLD.balance_date then
      raise exception '이미 기록된 입금의 입금일은 바꿀 수 없습니다. 정정은 마스터에게 요청해 주세요.' using errcode='42501'; end if;
  end if;
  return NEW;
end $f$;
create or replace function public.guard_payment_requires_date() returns trigger language plpgsql set search_path to 'public','pg_temp' as $f$
begin
  if coalesce(NEW.balance_amount,0) > 0 and coalesce(NEW.balance_date,'') = '' and (TG_OP = 'INSERT' or NEW.balance_amount is distinct from OLD.balance_amount or NEW.balance_date is distinct from OLD.balance_date) then
    raise exception '잔금 입금일이 비어 있습니다. 입금일을 입력해 주세요.' using errcode = '23514'; end if;
  if coalesce(NEW.deposit_amount,0) > 0 and coalesce(NEW.deposit_date,'') = '' and (TG_OP = 'INSERT' or NEW.deposit_amount is distinct from OLD.deposit_amount or NEW.deposit_date is distinct from OLD.deposit_date) then
    raise exception '선금 입금일이 비어 있습니다. 입금일을 입력해 주세요.' using errcode = '23514'; end if;
  return NEW;
end $f$;
-- ── 운영에서 읽어온 실제 트리거 정의(BEFORE 계열) ──
CREATE TRIGGER trg_enforce_estimate_status BEFORE INSERT OR UPDATE ON public.estimates FOR EACH ROW EXECUTE FUNCTION enforce_estimate_status_from_confirmed_at();
CREATE TRIGGER trg_estimates_confirm_guard BEFORE UPDATE ON public.estimates FOR EACH ROW EXECUTE FUNCTION estimates_confirm_guard();
CREATE TRIGGER trg_estimates_updated BEFORE UPDATE ON public.estimates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_guard_archived_estimate_payment BEFORE UPDATE OF deposit_amount, balance_amount ON public.estimates FOR EACH ROW EXECUTE FUNCTION guard_archived_estimate_payment();
CREATE TRIGGER trg_guard_payment_date BEFORE INSERT OR UPDATE ON public.estimates FOR EACH ROW EXECUTE FUNCTION guard_payment_requires_date();
CREATE TRIGGER trg_guard_payment_reduction_estimates BEFORE UPDATE OF deposit_amount, balance_amount, deposit_date, balance_date ON public.estimates FOR EACH ROW EXECUTE FUNCTION guard_payment_reduction();
insert into estimates(id,client_id,deposit_date,deposit_amount) values ('11111111-1111-1111-1111-111111111111',1,'2026-09-10',1000000);
insert into estimates(id,client_id,deposit_date,deposit_amount) values ('22222222-2222-2222-2222-222222222222',2,'2026-10-05',500000);
`);
let _sql = fs.readFileSync(R + '2026-10-26_closed_month_guard_DRAFT.sql', 'utf8'); if (process.env.REV) _sql = _sql.split('trg_closed_month_guard_est').join('trg_zz_closed_month_guard_est'); await db.exec(_sql); // REV=1: 역검증(트리거 이름을 뒤로 밀어 실행 순서가 바뀌면 시험이 잡는지)
const out = []; const ok = (l, c, d) => out.push((c ? '✅ ' : '❌ ') + l + (d ? ' — ' + d : ''));
async function as(uid, sql) { await db.exec(`select set_config('app.uid','${uid || ''}',false)`); try { await db.exec(sql); return true; } catch (e) { return e.message; } }
const has = (r, s) => typeof r === 'string' && r.includes(s);
// 1) 실행 순서
const ord = (await db.query(`select t.tgname from pg_trigger t where t.tgrelid='public.estimates'::regclass and not t.tgisinternal and (t.tgtype & 2)=2 and (t.tgtype & 16)=16 order by t.tgname`)).rows.map(r => r.tgname);
ok('1. 수정(BEFORE UPDATE) 트리거 중 마감월 가드가 가장 먼저 실행됨(이름순)', ord[0] === 'trg_closed_month_guard_est', ord.join(' > '));
let r;
r = await as(S, "update estimates set deposit_amount=1200000 where id='11111111-1111-1111-1111-111111111111'"); ok('2. 실장: 9월(마감) 입금액 늘리기 → 마감월 문구로 거부', has(r, '마감된 달(2026-09)'), String(r));
r = await as(S, "update estimates set deposit_amount=800000 where id='11111111-1111-1111-1111-111111111111'"); ok('3. 실장: 9월 입금액 줄이기 → 기존 문구보다 마감월 문구가 우선', has(r, '마감된 달(2026-09)'), String(r));
r = await as(S, "update estimates set deposit_amount=400000 where id='22222222-2222-2222-2222-222222222222'"); ok('4. 실장: 10월(열린 달) 입금액 줄이기 → 기존 보호 문구 그대로(가드가 방해하지 않음)', has(r, '줄이거나 지울 수 없습니다'), String(r));
r = await as(S, "update estimates set deposit_amount=600000 where id='22222222-2222-2222-2222-222222222222'"); ok('5. 실장: 10월 입금액 늘리기 → 허용(기존 동작)', r === true, String(r));
r = await as(S, "update estimates set balance_amount=100000 where id='22222222-2222-2222-2222-222222222222'"); ok('6. 실장: 10월 잔금을 입금일 없이 입력 → 기존 입금일 필수 문구 그대로(고객 날짜 10월=열린 달)', has(r, '입금일이 비어'), String(r));
r = await as(S, "update estimates set memo='메모' where id='11111111-1111-1111-1111-111111111111'"); ok('7. 실장: 마감월 견적서의 메모 수정 → 허용(돈과 무관)', r === true, String(r));
r = await as(S, "update estimates set confirmed_at=now() where id='11111111-1111-1111-1111-111111111111'"); ok('8. 실장: 마감월 견적서 확정 처리 → 허용(돈과 무관, 기존 확정 로그도 정상)', r === true, String(r));
const cl = (await db.query("select count(*)::int c from estimate_confirm_log")).rows[0].c; ok('9. 확정 로그가 기존대로 1건 쌓임', cl === 1, 'c=' + cl);
r = await as(M, "update estimates set deposit_amount=900000 where id='11111111-1111-1111-1111-111111111111'"); ok('10. 마스터: 9월 입금액 정정 → 허용', r === true, String(r));
const lg = (await db.query("select count(*)::int c from closed_month_edit_log where tbl='estimates'")).rows[0].c; ok('11. 마스터 정정은 마감월 수정 기록에 남음', lg === 1, 'c=' + lg);
r = await as(null, "update estimates set deposit_amount=950000 where id='11111111-1111-1111-1111-111111111111'"); ok('12. 서버 작업(로그인 없음): 허용+기록', r === true && (await db.query("select count(*)::int c from closed_month_edit_log")).rows[0].c === 2, String(r));
await db.exec("update estimates set is_archived=true where id='22222222-2222-2222-2222-222222222222'");
r = await as(S, "update estimates set deposit_amount=700000 where id='22222222-2222-2222-2222-222222222222'"); ok('13. 실장: 보관(숨김) 처리된 10월 견적서 입금 변경 → 기존 보관 문구 그대로', has(r, '보관 처리된'), String(r));
console.log(out.join('\n')); console.log(out.some(l => l.startsWith('❌')) ? '\n❌ 실패 있음' : '\n✅ 모두 통과');
