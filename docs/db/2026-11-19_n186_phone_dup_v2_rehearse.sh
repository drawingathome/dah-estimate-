#!/usr/bin/env bash
# N-186 가짜 DB 예행(운영 아님): 적용 → 결과·권한 확인 → 기존 함수 불변 → 되돌리기
set -uo pipefail
cd "$(dirname "$0")"
P="psql -v ON_ERROR_STOP=1 -q -X -At -P pager=off"; DB=dah_n186_rehearse; fail=0
ok(){ if [ "$2" = "$3" ]; then echo "✅ $1"; else echo "❌ $1 — 기대 [$3] / 실제 [$2]"; fail=1; fi; }
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
$P -d $DB <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create table public.customers(id bigint primary key, client_name text, phone text, staff_name text, stage text, is_archived boolean);
-- 운영의 기존 함수 2개(2026-11-19 읽어 온 정의)
create function public.check_phone_duplicate(phone_input text) returns table(exists_flag boolean, staff_name text) language sql security definer set search_path to 'public' as $f$
  select true, c.staff_name from customers c where regexp_replace(c.phone,'\D','','g') = regexp_replace(phone_input,'\D','','g') and c.is_archived = false limit 1; $f$;
create function public.check_phone_duplicate(phone_input text, name_input text) returns table(exists_flag boolean, staff_name text, same_name boolean) language sql security definer set search_path to 'public' as $f$
  select true, c.staff_name, (name_input is not null and lower(btrim(coalesce(c.client_name,''))) = lower(btrim(name_input)))
  from customers c where regexp_replace(c.phone,'\D','','g') = regexp_replace(phone_input,'\D','','g') and c.is_archived = false
  order by (name_input is not null and lower(btrim(coalesce(c.client_name,''))) = lower(btrim(name_input))) desc, c.id limit 1; $f$;
revoke all on function public.check_phone_duplicate(text) from public, anon; grant execute on function public.check_phone_duplicate(text) to authenticated, service_role;
revoke all on function public.check_phone_duplicate(text,text) from public, anon; grant execute on function public.check_phone_duplicate(text,text) to authenticated, service_role;
insert into customers values
 (112,'소지선','010-6258-8804','마스터','시공완료',false),
 (307,'소지선','010-6258-8804','오지은 실장','가견적',false),
 (48,'김정화','010-6242-3210','마스터','시공완료',false),
 (263,'박창우','010-6242-3210','오지은 실장','시공완료',false),
 (311,'임현정','010-7282-4432','마스터','가견적',false),
 (500,'보관고객','010-1111-2222','마스터','상담',true),
 (600,'번호없음','','마스터','상담',false),
 (700,'가족A','010-3333-4444','마스터','상담',false);
SQL
before=$($P -d $DB -c "select string_agg(pg_get_functiondef(p.oid), '' order by p.oid) from pg_proc p where proname='check_phone_duplicate'" | md5sum)
$P -d $DB -f 2026-11-19_n186_phone_dup_v2_apply.sql && echo "✅ 적용 성공" || { echo "❌ 적용 실패"; fail=1; }
q(){ $P -d $DB -c "select coalesce(exists_flag::text,'-')||'/'||coalesce(staff_name,'-')||'/'||same_name::text||'/'||stage||'/'||in_progress::text from check_phone_duplicate_v2('$1','$2')"; }
ok "소지선(같은 이름·진행 중 307 우선) → 307 진행 중 실장 담당" "$(q 01062588804 소지선)" "true/오지은 실장/true/가견적/true"
ok "번호 모양이 달라도(하이픈) 같은 결과" "$(q 010-6258-8804 소지선)" "true/오지은 실장/true/가견적/true"
ok "임현정(마스터 진행 중, 같은 이름)" "$(q 01072824432 임현정)" "true/마스터/true/가견적/true"
ok "김정화 번호로 박창우 입력(전부 시공완료, 같은 이름 없음 → 같은 번호 가족 확인)" "$(q 01062423210 새이름 | sed 's/^true\/[^/]*\/false\/시공완료\/false$/가족확인형/')" "가족확인형"
ok "김정화 번호로 김정화 입력(시공완료, 같은 이름) → 재구매형" "$(q 01062423210 김정화)" "true/마스터/true/시공완료/false"
ok "같은 번호·다른 이름(진행 중 가족A)" "$(q 01033334444 다른사람)" "true/마스터/false/상담/true"
ok "보관된 고객은 무시" "$(q 01011112222 보관고객)" ""
ok "없는 번호는 0행" "$(q 01099999999 아무개)" ""
ok "빈 번호는 0행(번호 없는 고객 600과 매칭 안 됨)" "$(q '' 번호없음)" ""
# 권한
ok "anon 실행 불가" "$($P -d $DB -c "select has_function_privilege('anon','public.check_phone_duplicate_v2(text,text)','execute')")" "f"
ok "public(누구나) 실행 불가" "$($P -d $DB -c "select count(*) from pg_proc p, aclexplode(p.proacl) a where p.proname='check_phone_duplicate_v2' and a.grantee=0")" "0"
ok "authenticated 실행 가능" "$($P -d $DB -c "select has_function_privilege('authenticated','public.check_phone_duplicate_v2(text,text)','execute')")" "t"
ok "SECURITY DEFINER" "$($P -d $DB -c "select prosecdef from pg_proc where proname='check_phone_duplicate_v2'")" "t"
after=$($P -d $DB -c "select string_agg(pg_get_functiondef(p.oid), '' order by p.oid) from pg_proc p where proname='check_phone_duplicate'" | md5sum)
ok "기존 함수 2개 본문 불변" "$after" "$before"
$P -d $DB -f 2026-11-19_n186_phone_dup_v2_rollback.sql
ok "되돌리기 후 v2 없음" "$($P -d $DB -c "select count(*) from pg_proc where proname='check_phone_duplicate_v2'")" "0"
ok "되돌리기 후 기존 함수 2개 그대로" "$($P -d $DB -c "select count(*) from pg_proc where proname='check_phone_duplicate'")" "2"
[ $fail = 0 ] && echo "=== 예행 전부 통과 ===" || { echo "=== 실패 있음 ==="; exit 1; }
