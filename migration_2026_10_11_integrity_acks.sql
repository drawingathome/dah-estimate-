-- 2026-10-11: "데이터 점검" 카드의 "확인함" 기록을 기기 대신 DB에 저장 (누가/언제/메모). 마스터와 실장이 같은 상태를 봄.
-- ack_key = 이상 항목의 고유키(코드|고객id|내용). 내용이 바뀌면 키가 달라져 다시 뜸.
create table if not exists public.integrity_acks (
  ack_key text primary key,
  code text not null,
  customer_id bigint,
  client_name text,
  note text,
  acked_by uuid not null default auth.uid(),
  acked_by_name text,
  acked_at timestamptz not null default now()
);
alter table public.integrity_acks enable row level security;
revoke all on public.integrity_acks from anon;
revoke truncate, references, trigger, update, delete on public.integrity_acks from authenticated;
grant select, insert on public.integrity_acks to authenticated;

-- 볼 수 있는 고객(RLS 적용)에 대한 기록이거나, 마스터만 (고객 없는 항목 등)
create policy integrity_acks_select on public.integrity_acks for select to authenticated using (
  (auth.uid() is not null) and (
    exists (select 1 from public.staff_profiles p where p.id = auth.uid() and p.role = 'master')
    or (customer_id is not null and exists (select 1 from public.customers c where c.id = integrity_acks.customer_id))
  ));
create policy integrity_acks_insert on public.integrity_acks for insert to authenticated with check (
  (auth.uid() is not null) and acked_by = auth.uid() and (
    exists (select 1 from public.staff_profiles p where p.id = auth.uid() and p.role = 'master')
    or (customer_id is not null and exists (select 1 from public.customers c where c.id = integrity_acks.customer_id))
  ));
