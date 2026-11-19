-- N-186 (2026-11-19) 같은 연락처 확인 함수 v2 — '시공완료 여부'를 함께 알려 줌 (추가만 함, 기존 함수 2개는 건드리지 않음)
-- 목적: 대시보드 '고객 추가'가 ①진행 중인 같은 고객(임현정형 중복)은 막고 ②시공완료 고객의 재구매(소지선형)는 '이미 ○○ 담당' 확인 뒤 등록하게 구분.
-- 보안: 기존 함수와 같은 SECURITY DEFINER(담당자와 상관없이 찾음) + 같은 실행 권한(로그인 사용자·service_role만, anon·public 불가). 고객 이름·금액은 돌려주지 않음(담당자 이름·단계만).
-- 반환: exists_flag / staff_name / same_name(입력 이름과 같은지) / stage / in_progress(시공완료가 아니면 true)
-- 정렬: 같은 이름 우선 → 진행 중 우선 → id 작은 순 (가장 '막아야 할' 행이 먼저)
create or replace function public.check_phone_duplicate_v2(phone_input text, name_input text)
 returns table(exists_flag boolean, staff_name text, same_name boolean, stage text, in_progress boolean)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select true as exists_flag,
         c.staff_name,
         (name_input is not null and lower(btrim(coalesce(c.client_name,''))) = lower(btrim(name_input))) as same_name,
         c.stage,
         (coalesce(c.stage,'') <> '시공완료') as in_progress
  from customers c
  where regexp_replace(coalesce(c.phone,''), '\D', '', 'g') = regexp_replace(coalesce(phone_input,''), '\D', '', 'g')
    and regexp_replace(coalesce(phone_input,''), '\D', '', 'g') <> ''
    and coalesce(c.is_archived, false) = false
  order by (name_input is not null and lower(btrim(coalesce(c.client_name,''))) = lower(btrim(name_input))) desc,
           (coalesce(c.stage,'') <> '시공완료') desc,
           c.id
  limit 1;
$function$;
revoke all on function public.check_phone_duplicate_v2(text, text) from public, anon;
grant execute on function public.check_phone_duplicate_v2(text, text) to authenticated, service_role;
