-- 2026-10-14 S1·S2: 실장(비마스터)이 담당자 이름을 마음대로 바꾸거나, 남의 이름으로 고객·견적서를 만드는 것을 DB에서 막음.
-- 허용: (1) 마스터는 전부 허용 (2) 로그인 없는 서버 작업(Apps Script·점검 SQL)은 그대로 (3) 실장은 '미배정' 고객을 본인 이름으로 가져가기,
--       본인 이름 또는 '미배정'으로 새로 만들기. 그 밖의 담당자 변경·생성은 거부.
create or replace function public.guard_staff_name_change() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
declare v_role text; v_name text;
begin
  if auth.uid() is null then return NEW; end if;
  select role, display_name into v_role, v_name from public.staff_profiles where id = auth.uid();
  if v_role = 'master' then return NEW; end if;
  if TG_OP = 'INSERT' then
    if NEW.staff_name is distinct from v_name and NEW.staff_name is distinct from '미배정' then
      raise exception '담당자는 본인 이름 또는 미배정으로만 등록할 수 있습니다.' using errcode = '42501';
    end if;
  elsif NEW.staff_name is distinct from OLD.staff_name then
    if not (OLD.staff_name = '미배정' and NEW.staff_name = v_name) then
      raise exception '담당자 변경은 마스터만 할 수 있습니다. (미배정 고객을 본인이 가져가는 것만 가능)' using errcode = '42501';
    end if;
  end if;
  return NEW;
end $fn$;
create or replace trigger trg_guard_staff_name_customers before insert or update of staff_name on public.customers
  for each row execute function public.guard_staff_name_change();
create or replace trigger trg_guard_staff_name_estimates before insert or update of staff_name on public.estimates
  for each row execute function public.guard_staff_name_change();
