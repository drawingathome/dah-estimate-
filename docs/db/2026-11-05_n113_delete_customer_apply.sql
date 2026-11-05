-- N-113: 고객 완전삭제를 '한 번에'(견적서+고객, 실패하면 전부 취소) 처리하는 함수. 미적용 초안.
-- 왜: 앱이 견적서를 먼저 지우고 고객을 나중에 지우는 두 번의 요청이라, 고객 삭제가 막히면(발주 기록 FK, 권한 등) 견적서만 사라지는 반쪽 삭제가 생김.
-- 권한은 호출한 사람 기준(SECURITY INVOKER): 기존 RLS(마스터 전체/실장 본인 담당)가 그대로 적용됨. 고객 행이 0건 지워지면(권한 없음·이미 없음) 오류로 전부 취소.
begin;
create or replace function public.dah_delete_customer(p_customer_id bigint)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare n_est int; n_cust int;
begin
  if p_customer_id is null then raise exception '고객 번호가 없습니다.'; end if;
  delete from public.estimates where client_id = p_customer_id;
  get diagnostics n_est = row_count;
  delete from public.customers where id = p_customer_id;
  get diagnostics n_cust = row_count;
  if n_cust = 0 then
    raise exception '고객을 삭제할 수 없습니다(권한이 없거나 이미 삭제됨). 견적서도 지우지 않았습니다.' using errcode = '42501';
  end if;
  return jsonb_build_object('estimates_deleted', n_est, 'customers_deleted', n_cust);
end $$;
revoke all on function public.dah_delete_customer(bigint) from public, anon;
grant execute on function public.dah_delete_customer(bigint) to authenticated;
commit;
