-- ============================================================
-- [운영 예행용 시험 블록 · 반드시 마지막에 오류를 내서 전부 취소됨]
-- 이 블록은 "마감월 가드 적용 SQL" 바로 뒤에 붙여 한 번에 실행한다(합본: 2026-10-27_closed_month_guard_prod_rehearse.sql).
-- 구조: 가드 설치 → 시험(각각 작은 안쪽 구역에서 실행, 실패해도 바깥은 계속) → 마지막에 무조건 REHEARSAL_RESULT 오류 → 위 모든 변경이 자동 취소.
-- 결과는 오류 메시지 안에 담겨 돌아온다. 오류 메시지에 'REHEARSAL_RESULT'가 없으면 취소가 보장되지 않으므로 즉시 읽기로 확인하고 되돌리기 SQL을 실행한다.
-- 시험 대상은 운영 데이터에서 자동으로 고르며(마감월 견적서 1건·열린 달 견적서 1건·마스터·실장 각 1명) 모든 수정은 취소된다.
-- ============================================================
do $rehearse$
declare
  v_res text := '';
  v_master uuid; v_staff uuid; v_est uuid; v_open_est uuid;
  v_n0 int; v_n1 int; v_msg text; v_first text;
begin
  select id into v_master from public.staff_profiles where role = 'master' limit 1;
  select id into v_staff  from public.staff_profiles where role <> 'master' limit 1;
  select id into v_est from public.estimates
    where left(coalesce(deposit_date,''),7) in (select month from public.monthly_close)
      and coalesce(deposit_amount,0) > 0 and coalesce(is_archived,false) = false limit 1;
  select id into v_open_est from public.estimates
    where coalesce(deposit_date,'') <> '' and left(deposit_date,7) not in (select month from public.monthly_close)
      and coalesce(deposit_amount,0) > 0 and coalesce(is_archived,false) = false limit 1;
  v_res := v_res || format('대상: 마스터=%s 실장=%s 마감월견적서=%s 열린달견적서=%s; ', v_master is not null, v_staff is not null, v_est is not null, v_open_est is not null);

  -- 시험 0: 실행 순서 (가드가 수정 BEFORE 트리거 중 가장 먼저)
  select t.tgname into v_first from pg_trigger t
   where t.tgrelid = 'public.estimates'::regclass and not t.tgisinternal and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16 order by t.tgname limit 1;
  v_res := v_res || case when v_first = 'trg_closed_month_guard_est' then 'T0 순서 PASS; ' else 'T0 순서 FAIL(' || coalesce(v_first,'-') || '); ' end;

  -- 시험 1: 실장이 마감월 입금액을 바꾸면 거부
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff)::text, true);
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    update public.estimates set deposit_amount = deposit_amount + 1 where id = v_est;
    v_res := v_res || 'T1 실장 마감월 변경 FAIL(막히지 않음); ';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_res := v_res || case when v_msg like '%마감된 달(%' then 'T1 실장 마감월 변경 거부 PASS; ' else 'T1 FAIL(다른 이유로 거부: ' || left(v_msg,60) || '); ' end;
  end;

  -- 시험 2: 실장이 마감월 견적서의 돈과 무관한 수정은 허용
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff)::text, true);
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    update public.estimates set updated_at = now() where id = v_est;
    v_res := v_res || 'T2 돈 무관 수정 허용 PASS; ';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_res := v_res || 'T2 FAIL(' || left(v_msg,60) || '); ';
  end;

  -- 시험 3: 마스터는 마감월 정정 가능 + 기록 1건
  begin
    select count(*) into v_n0 from public.closed_month_edit_log;
    perform set_config('request.jwt.claims', json_build_object('sub', v_master)::text, true);
    perform set_config('request.jwt.claim.sub', v_master::text, true);
    update public.estimates set deposit_amount = deposit_amount + 1 where id = v_est;
    select count(*) into v_n1 from public.closed_month_edit_log;
    v_res := v_res || case when v_n1 = v_n0 + 1 then 'T3 마스터 정정 허용+기록 PASS; ' else 'T3 FAIL(기록 ' || v_n0 || '→' || v_n1 || '); ' end;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_res := v_res || 'T3 FAIL(' || left(v_msg,60) || '); ';
  end;

  -- 시험 4: 열린 달 견적서는 가드가 방해하지 않음(마감월 문구가 나오면 안 됨)
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff)::text, true);
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    update public.estimates set deposit_amount = deposit_amount + 1 where id = v_open_est;
    v_res := v_res || 'T4 열린 달 변경 통과 PASS; ';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_res := v_res || case when v_msg like '%마감된 달(%' then 'T4 FAIL(열린 달인데 마감월 거부)' else 'T4 열린 달: 기존 보호만 작동 PASS(' || left(v_msg,40) || ')' end || '; ';
  end;

  -- 무조건 취소: 위의 설치·수정이 모두 되돌려진다
  raise exception 'REHEARSAL_RESULT|%', v_res;
end
$rehearse$;
