-- N-115 되돌리기: 2026-11-05 운영에서 읽은 원래 함수 본문 그대로 복원(전화번호 전체 반환).
begin;
create or replace function public.get_public_estimate(p_id uuid)
returns table(customer_name text, phone text, staff_name text, install_date text, estimate_status text, line_items jsonb)
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  return query
  select e.customer_name, e.phone, e.staff_name, e.install_date, e.estimate_status, e.line_items
  from estimates e
  where e.id = p_id and e.is_archived = false;
end;
$$;
commit;
