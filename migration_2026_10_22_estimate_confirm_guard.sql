-- 2026-10-22 확정 보호: 확정 해제에는 사유 필수 + 확정/해제 기록표(RLS 포함). 앱(est-form-controls.js)은 이미 사유를 함께 보냄.
-- ③ 확정 보호 (정식본: RLS 포함, 문서 2026-10-17 A)

alter table public.estimates add column if not exists unconfirm_reason text;

create table if not exists public.estimate_confirm_log (
  id bigint generated always as identity primary key,
  estimate_id uuid not null,
  client_id bigint,
  action text not null check (action in ('confirm','unconfirm')),
  reason text,
  confirmed_at_before timestamptz,
  confirmed_at_after timestamptz,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
alter table public.estimate_confirm_log enable row level security;

drop policy if exists estimate_confirm_log_select on public.estimate_confirm_log;
create policy estimate_confirm_log_select on public.estimate_confirm_log for select using (
  (select auth.uid()) is not null and (
    exists (select 1 from public.staff_profiles p where p.id = (select auth.uid()) and p.role = 'master')
    or exists (select 1 from public.estimates e
               where e.id = estimate_confirm_log.estimate_id
                 and e.staff_name = (select sp.display_name from public.staff_profiles sp where sp.id = (select auth.uid())))
  )
);

create or replace function public.estimates_confirm_guard() returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare v_reason text;
begin
  if TG_OP = 'UPDATE' and OLD.confirmed_at is distinct from NEW.confirmed_at then
    v_reason := nullif(btrim(coalesce(NEW.unconfirm_reason, '')), '');
    if OLD.confirmed_at is not null and NEW.confirmed_at is null then
      if auth.uid() is not null and v_reason is null then
        raise exception '확정 해제에는 사유가 필요합니다. 견적서 화면의 "확정" 버튼으로 사유를 선택해 해제해 주세요.' using errcode = '42501';
      end if;
      insert into public.estimate_confirm_log(estimate_id, client_id, action, reason, confirmed_at_before, confirmed_at_after)
        values (OLD.id, OLD.client_id, 'unconfirm', coalesce(v_reason, '(관리자 작업)'), OLD.confirmed_at, NEW.confirmed_at);
    elsif NEW.confirmed_at is not null then
      insert into public.estimate_confirm_log(estimate_id, client_id, action, reason, confirmed_at_before, confirmed_at_after)
        values (OLD.id, OLD.client_id, 'confirm', null, OLD.confirmed_at, NEW.confirmed_at);
    end if;
  end if;
  if TG_OP = 'UPDATE' then NEW.unconfirm_reason := null; end if;
  return NEW;
end $f$;

drop trigger if exists trg_estimates_confirm_guard on public.estimates;
create trigger trg_estimates_confirm_guard
  before update on public.estimates
  for each row execute function public.estimates_confirm_guard();
