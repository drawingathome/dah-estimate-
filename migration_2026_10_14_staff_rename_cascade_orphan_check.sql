-- 2026-10-14 (2-9 가벼운 1차 보강, 운영 DB 적용 완료: staff_rename_cascade_and_unique_name + integrity_orphan_staff_rule)
-- 담당자 연결은 아직 "이름 글자"이므로, 이름이 어긋나 직원이 자기 고객을 못 보게 되는 사고를 막는다.
-- (1) 직원 표시 이름 중복 금지 (2) 직원 표시 이름을 바꾸면 그 직원 담당 고객·견적서의 담당자 이름도 같이 바뀜 (3) 점검 규칙 ORPHAN_STAFF 추가
create unique index if not exists staff_profiles_display_name_unique on public.staff_profiles (lower(display_name));

create or replace function public.cascade_staff_rename() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
begin
  if NEW.display_name is distinct from OLD.display_name and OLD.display_name is not null and NEW.role <> 'master' then
    update public.customers set staff_name = NEW.display_name where staff_name = OLD.display_name;
    update public.estimates set staff_name = NEW.display_name where staff_name = OLD.display_name;
  end if;
  return NEW;
end $fn$;
revoke execute on function public.cascade_staff_rename() from public, anon, authenticated;
create or replace trigger trg_cascade_staff_rename after update of display_name on public.staff_profiles
  for each row execute function public.cascade_staff_rename();

-- 점검 규칙 ORPHAN_STAFF: 담당자 이름이 직원 목록에 없는 고객(마스터·미배정 제외) — 그 직원이 자기 고객을 못 볼 수 있음.
-- 기존 data_integrity_issues 정의 뒤에 UNION ALL 한 줄을 덧붙임(기존 규칙은 그대로).
do $mig$
declare v text;
begin
  select regexp_replace(pg_get_viewdef('public.data_integrity_issues'::regclass, true), ';\s*$', '') into v;
  if v like '%ORPHAN_STAFF%' then return; end if;
  execute 'create or replace view public.data_integrity_issues as ' || v ||
    $q$ UNION ALL SELECT 'ORPHAN_STAFF'::text AS code, 'warn'::text AS severity, c.id AS customer_id, c.client_name, c.staff_name,
         '담당자 이름이 직원 목록에 없음 - 그 직원이 이 고객을 못 볼 수 있음'::text AS detail
       FROM c WHERE c.staff_name IS NOT NULL AND c.staff_name <> ALL (ARRAY['마스터'::text, '미배정'::text, ''::text])
         AND NOT EXISTS (SELECT 1 FROM public.staff_profiles p WHERE p.display_name = c.staff_name)$q$;
  execute 'alter view public.data_integrity_issues set (security_invoker = true)'; -- create or replace가 옵션을 초기화하므로 반드시 다시 설정(2026-10-15 사고 수정)
end $mig$;
