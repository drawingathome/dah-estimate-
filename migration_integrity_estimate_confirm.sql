-- 2026-10-19: 점검 규칙을 견적서 단위로 보강 + 래퍼 뷰 정의를 저장소에 보관.
-- 배경: CONFIRM_MISSING 은 "고객 단위"라서, 한 고객에 확정 견적서가 하나라도 있으면(예: 침구 확정) 입금이 다 된 다른 견적서(커튼·블라인드)가
-- 미확정으로 남아 있어도 못 잡았음(시험가). ESTIMATE_UNCONFIRMED_PAID 는 "입금이 있는데 확정이 안 된 견적서"를 견적서 단위로 잡음.
-- 옛 이관 데이터(시공완료 단계, 확정 시각 없음) 약 80건이 경고로 쏟아지지 않도록 진행 중인 단계만 검사하고,
-- 고객 단위 CONFIRM_MISSING 과 겹치는 경우(확정 견적서가 하나도 없는 진행 고객)는 중복해서 올리지 않음.
-- 2026-10-20 수정(선혜님 지적): 선금결제·실측준비중은 '선금 받고 실측한 뒤 최종견적서가 나오는' 정상 구간이라 가견적이 맞음 → 경고 대상에서 제외.
--   확정견적 이후(확정견적·잔금결제·시공준비중) 단계에서만 '확정 안 됨'을 경고.
-- 적용 전 구조: data_integrity_issues(security_invoker 뷰) = data_integrity_issues_base + CONFIRM_MISSING + PAY_DATE_MISMATCH(선금/잔금).
create or replace view public.data_integrity_issues with (security_invoker = true) as
select code, severity, customer_id, client_name, staff_name, detail from public.data_integrity_issues_base
union all
select 'CONFIRM_MISSING'::text as code, 'warn'::text as severity, c.id as customer_id, c.client_name, c.staff_name,
  ('진행 단계(' || c.stage || ')인데 확정된 견적서가 없음(가견적) - 확정 후 저장했는지, 의도한 상태인지 확인')::text as detail
from public.customers c
where not coalesce(c.is_archived, false)
  and c.stage = any (array['확정견적','잔금결제','시공준비중'])
  and exists (select 1 from public.estimates x where x.client_id = c.id and not coalesce(x.is_archived, false))
  and not exists (select 1 from public.estimates x where x.client_id = c.id and not coalesce(x.is_archived, false) and x.confirmed_at is not null)
union all
select 'PAY_DATE_MISMATCH'::text as code, 'warn'::text as severity, c.id, c.client_name, c.staff_name,
  ('고객 칸 입금일(' || coalesce(nullif(c.deposit_date, ''), '없음') || ')이 견적서 최신 입금일(' || e.ed || ')과 다름')::text
from public.customers c
join lateral (select max(x.deposit_date) filter (where x.deposit_date is not null and x.deposit_date <> '') as ed from public.estimates x where x.client_id = c.id and not coalesce(x.is_archived, false)) e on true
where not coalesce(c.is_archived, false) and e.ed is not null and coalesce(c.deposit_date, '') <> e.ed
union all
select 'PAY_DATE_MISMATCH'::text as code, 'warn'::text as severity, c.id, c.client_name, c.staff_name,
  ('고객 칸 잔금일(' || coalesce(nullif(c.balance_date, ''), '없음') || ')이 견적서 최신 잔금일(' || e.ed || ')과 다름')::text
from public.customers c
join lateral (select max(x.balance_date) filter (where x.balance_date is not null and x.balance_date <> '') as ed from public.estimates x where x.client_id = c.id and not coalesce(x.is_archived, false)) e on true
where not coalesce(c.is_archived, false) and e.ed is not null and coalesce(c.balance_date, '') <> e.ed
union all
select 'ESTIMATE_UNCONFIRMED_PAID'::text as code, 'warn'::text as severity, c.id, c.client_name, c.staff_name,
  ('입금 ' || to_char(p.paid, 'FM999,999,999,999') || '원이 있는 견적서(총액 ' || to_char(coalesce(e.price, 0), 'FM999,999,999,999') || '원)가 아직 가견적 - 확정이 필요한지 확인')::text
from public.estimates e
join public.customers c on c.id = e.client_id
cross join lateral (select coalesce(e.deposit_amount, 0) + coalesce(e.balance_amount, 0)
  + coalesce((select sum(x.amount) from public.estimate_extra_payments x where x.estimate_id = e.id), 0) as paid) p
where not coalesce(e.is_archived, false) and not coalesce(c.is_archived, false)
  and e.confirmed_at is null and p.paid > 0
  and c.stage = any (array['확정견적','잔금결제','시공준비중'])
  and not (c.stage = any (array['확정견적','잔금결제','시공준비중'])
           and not exists (select 1 from public.estimates y where y.client_id = c.id and not coalesce(y.is_archived, false) and y.confirmed_at is not null));
