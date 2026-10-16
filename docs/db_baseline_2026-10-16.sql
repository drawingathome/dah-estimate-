-- DB 기준선 스냅샷 (2026-10-16, 운영 DB에서 직접 읽어 옮김) — 참고·재현용. 자동 실행 대상 아님.
-- 이유: 운영 DB에 적용된 마이그레이션 68개 중, 아래 객체들은 저장소에 만든 SQL이 없었음(저장소만으로는 DB를 다시 만들 수 없는 구멍).
-- 이 파일이 그 구멍을 메움. 이후 DB 변경은 migration_*.sql 로 저장소에 함께 남길 것.

-- ── 표 ─────────────────────────────────────────────
create table public.payment_ledger (
  id bigint primary key,                      -- (운영: identity/sequence)
  customer_id bigint not null references public.customers(id) on delete cascade,
  estimate_id uuid,
  staff_name text,
  kind text not null check (kind = any (array['입금','환불','조정'])),
  amount numeric not null check (amount <> 0),
  paid_at date not null,
  date_estimated boolean not null default false,
  method text, memo text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check ((kind='입금' and amount>0) or (kind='환불' and amount<0) or kind='조정')
);
create table public.monthly_close (
  month text primary key check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  revenue numeric not null default 0,
  perf_revenue numeric not null default 0,
  contract_count integer not null default 0,
  by_staff jsonb not null default '{}'::jsonb,
  note text,
  closed_at timestamptz not null default now(),
  closed_by uuid default auth.uid()
);
alter table public.payment_ledger enable row level security;
alter table public.monthly_close enable row level security;

-- ── 정책 (마스터 = staff_profiles.role='master') ───────────────
-- monthly_close: select/insert/update/delete 모두 마스터만
-- payment_ledger: insert/update/delete 마스터만, select는 마스터 또는 본인 담당(staff_name = 내 display_name)

-- ── 트리거 (운영 17개) ─────────────────────────────
-- trg_customers_updated / trg_estimates_updated : BEFORE UPDATE → update_updated_at()
-- trg_estimate_history : AFTER DELETE OR UPDATE ON estimates → log_estimate_history()
-- trg_customer_history : AFTER DELETE OR UPDATE ON customers → log_customer_history()
-- trg_enforce_estimate_status : BEFORE INSERT OR UPDATE ON estimates → enforce_estimate_status_from_confirmed_at()
-- trg_sync_customer_payment : AFTER INSERT OR DELETE OR UPDATE OF deposit_amount,balance_amount,is_archived,client_id ON estimates → sync_customer_payment_from_estimates()
-- trg_customers_auto_stage : BEFORE UPDATE OF deposit_amount ON customers → customers_auto_stage_on_deposit()
-- trg_guard_payment_date : BEFORE INSERT OR UPDATE ON customers, estimates → guard_payment_requires_date()
-- trg_adjust_customer_amounts_on_estimate_delete : AFTER DELETE ON estimates → adjust_customer_amounts_on_estimate_delete()
-- trg_guard_staff_name_customers / _estimates : BEFORE INSERT OR UPDATE OF staff_name → guard_staff_name_change()
-- trg_payment_refunds_append_only : BEFORE DELETE OR UPDATE ON payment_refunds → payment_refunds_append_only()
-- trg_guard_payment_reduction_estimates : BEFORE UPDATE OF deposit_amount,balance_amount,deposit_date,balance_date ON estimates → guard_payment_reduction()
-- trg_guard_payment_reduction_customers : BEFORE UPDATE OF deposit_amount,balance_amount ON customers → guard_payment_reduction()
-- trg_guard_archived_estimate_payment : BEFORE UPDATE OF deposit_amount,balance_amount ON estimates → guard_archived_estimate_payment()
-- trg_cascade_staff_rename : AFTER UPDATE OF display_name ON staff_profiles → cascade_staff_rename()

-- ── 저장소에 만든 SQL이 없던 함수 ────────────────────────
create or replace function public.customers_auto_stage_on_deposit() returns trigger language plpgsql set search_path to '' as $f$
begin
  if TG_OP = 'UPDATE' and NEW.deposit_amount is distinct from OLD.deposit_amount
     and NEW.stage in ('방문예약','상담','가견적')
     and coalesce(NEW.deposit_amount, 0) > 0 then
    NEW.stage := '선금결제';
  end if;
  return NEW;
end $f$;

create or replace function public.guard_payment_requires_date() returns trigger language plpgsql set search_path to 'public','pg_temp' as $f$
begin
  if coalesce(NEW.balance_amount,0) > 0 and coalesce(NEW.balance_date,'') = ''
     and (TG_OP = 'INSERT' or NEW.balance_amount is distinct from OLD.balance_amount or NEW.balance_date is distinct from OLD.balance_date) then
    raise exception '잔금 입금일이 비어 있습니다. 입금일을 입력해 주세요.' using errcode = '23514';
  end if;
  if coalesce(NEW.deposit_amount,0) > 0 and coalesce(NEW.deposit_date,'') = ''
     and (TG_OP = 'INSERT' or NEW.deposit_amount is distinct from OLD.deposit_amount or NEW.deposit_date is distinct from OLD.deposit_date) then
    raise exception '선금 입금일이 비어 있습니다. 입금일을 입력해 주세요.' using errcode = '23514';
  end if;
  return NEW;
end $f$;
-- 나머지 함수 본문은 migration_2026_10_14_*.sql / migration_auto_sync_customer_payment.sql 참고
