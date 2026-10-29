-- (2026-10-14: PRICE_DIFF는 계약 이후 단계만 비교 - 가견적은 여러 건이 정상이고 합산하지 않으므로 오탐이었음(시험조).)
-- (2026-10-13: 입금 0원 점검은 금액이 0원(무료 협찬 등)인 고객 제외. PRICE_DIFF는 고객의 모든 견적서 합계와 비교(계약 여러 건 고객 오탐 수정). 실측일/시공일은 선금 전에도 입력하는 정상 값이라 STALE_SCHEDULE 규칙 제거)
-- 2026-10-11: 이상 데이터 자동 점검 뷰 (홈 화면 "데이터 점검" 카드가 읽음). 읽기 전용 / security_invoker=true라 로그인한 사람의 RLS 권한대로만 보임.
-- 이미 운영 DB에 적용됨(apply_migration data_integrity_issues_view_price_diff + data_integrity_issues_lock_grants). 재적용해도 안전(create or replace).
create or replace view public.data_integrity_issues with (security_invoker = true) as
with c as (select * from public.customers where not coalesce(is_archived,false)),
e as (select * from public.estimates where not coalesce(is_archived,false)),
latest as (select client_id, sum(price) as price, sum(performance_revenue) as performance_revenue from public.estimates where client_id is not null group by client_id)
select 'NO_ESTIMATE'::text as code, 'warn'::text as severity, c.id as customer_id, c.client_name, c.staff_name,
       ('견적서가 없는데 단계가 '||c.stage)::text as detail
  from c where c.stage not in ('방문예약','상담') and not exists (select 1 from e where e.client_id=c.id)
union all
select 'PAID_STAGE_NO_DEPOSIT','info', c.id, c.client_name, c.staff_name, (c.stage||' 단계인데 입금 기록이 0원')
  from c where c.stage in ('선금결제','실측준비중','확정견적','잔금결제','시공준비중','시공완료')
   and coalesce(c.price,0)>0 and coalesce(c.deposit_amount,0)=0 and coalesce(c.balance_amount,0)=0
union all
select 'DONE_NO_INSTALL_DATE','info', c.id, c.client_name, c.staff_name, '시공완료인데 시공일이 비어 있음'
  from c where c.stage='시공완료' and c.install_date is null
union all
select 'OVERPAID','warn', c.id, c.client_name, c.staff_name,
       ('입금합계 '||(coalesce(c.deposit_amount,0)+coalesce(c.balance_amount,0))||'원이 금액 '||c.price||'원보다 큼')
  from c where c.price>0 and coalesce(c.deposit_amount,0)+coalesce(c.balance_amount,0) > c.price
union all
select 'NO_STAFF','warn', c.id, c.client_name, c.staff_name, '진행 중인데 담당자가 없거나 미배정'
  from c where c.stage not in ('방문예약','상담') and (c.staff_name is null or c.staff_name in ('','미배정'))
union all
select 'MULTI_FINAL','warn', c.id, c.client_name, c.staff_name, ('확정견적이 '||count(*)||'건')
  from c join e on e.client_id=c.id and e.estimate_status='final' group by c.id,c.client_name,c.staff_name having count(*)>1
union all
select 'ORPHAN_ESTIMATE','warn', null::bigint, e.customer_name, e.staff_name, ('연결된 고객이 없는 견적서 '||e.id)
  from e where e.client_id is null or not exists (select 1 from public.customers x where x.id=e.client_id)
union all
select 'PRICE_DIFF','info', c.id, c.client_name, c.staff_name,
       ('진행 중인데 고객 매출기준금액('||c.price||')이 견적서 금액('||l.price::bigint||')과 다름 - 직접 고친 값이면 무시')
  from c join latest l on l.client_id=c.id
  where c.stage in ('선금결제','실측준비중','확정견적','잔금결제','시공준비중') and c.price<>l.price
union all
select 'HIDDEN_ESTIMATE','warn', c.id, c.client_name, c.staff_name,
       ('숨김(보관) 상태 견적서가 있음('||h.price::bigint||'원) - 견적서 목록에 안 보임. 살릴지 정리할지 확인')
  from public.estimates h join c on c.id=h.client_id where coalesce(h.is_archived,false)
union all
-- 2026-10-14(입력 경고 1-9): 입금이 있는데 성과매출이 0이면 화면은 견적서 총액 전체를 성과매출로 계산함(레일·시공비까지 포함될 수 있음)
select 'PERF_ZERO_WITH_PAYMENT','info', e.client_id, e.customer_name, e.staff_name,
       ('입금이 있는데 성과매출이 0 - 견적서 총액 '||e.price::bigint||'원 전체가 성과매출로 계산됨. 제품비용만이 맞는지 확인')
  from e where coalesce(e.price,0)>0 and coalesce(e.performance_revenue,0)=0 and coalesce(e.deposit_amount,0)+coalesce(e.balance_amount,0)>0
    and not exists (select 1 from c where c.id=e.client_id and c.memo ~ '플러그|Pluuug') -- 옛 플러그 이관 고객 8명은 성과매출 값이 원래 없어 제외(이미 알려진 이관 데이터)
union all
select 'PERF_OVER_PRICE','warn', e.client_id, e.customer_name, e.staff_name,
       ('성과매출('||e.performance_revenue::bigint||')이 견적서 총액('||coalesce(e.price,0)::bigint||')보다 큼')
  from e where coalesce(e.performance_revenue,0)>coalesce(e.price,0) and coalesce(e.performance_revenue,0)>0
union all
-- 고객 칸 입금합계는 DB가 견적서에서 자동으로 맞추므로 어긋나면 직접 고친 것(또는 동기화 오류)
select 'PAY_SUM_MISMATCH','warn', c.id, c.client_name, c.staff_name,
       ('고객 칸 입금합계 '||(coalesce(c.deposit_amount,0)+coalesce(c.balance_amount,0))::bigint||'원이 견적서 입금합계 '||s.paid::bigint||'원과 다름')
  from c join (select client_id, sum(coalesce(deposit_amount,0)+coalesce(balance_amount,0)) as paid from e where client_id is not null group by client_id) s on s.client_id=c.id
  where coalesce(c.deposit_amount,0)+coalesce(c.balance_amount,0) <> s.paid;
revoke all on public.data_integrity_issues from anon;
revoke insert, update, delete, truncate, references, trigger on public.data_integrity_issues from authenticated;
grant select on public.data_integrity_issues to authenticated;
