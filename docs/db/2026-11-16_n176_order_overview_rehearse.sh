#!/usr/bin/env bash
# N-176 가짜 DB 예행(운영 아님): 적용 → 결과 확인 → 되돌리기 → 함수가 없어졌는지 확인
set -uo pipefail
cd "$(dirname "$0")"
P="psql -v ON_ERROR_STOP=1 -q -X -At -P pager=off"; DB=dah_n176_rehearse; fail=0
ok(){ if [ "$2" = "$3" ]; then echo "✅ $1"; else echo "❌ $1 — 기대 [$3] / 실제 [$2]"; fail=1; fi; }
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
$P -d $DB <<'SQL'
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
create table public.customers(id bigint primary key, order_status jsonb);
create table public.estimates(id serial primary key, client_id bigint, is_archived boolean, line_items jsonb);
SQL
# 운영에서 읽어 온 현재(2026-11-16) dah_order_complete 정의를 그대로 설치
$P -d $DB <<'SQL'
create or replace function public.dah_order_complete(p_customer_id bigint, p_order_status jsonb)
 returns boolean language sql stable set search_path to 'public','pg_temp' as $f$
  with li as (
    select case when jsonb_typeof(e1.line_items) = 'array' then e1.line_items else '[]'::jsonb end li
    from public.estimates e1 where e1.client_id = p_customer_id and not coalesce(e1.is_archived, false)
  ),
  cnt as (
    select (select count(*) from li, jsonb_array_elements(li.li) x where x->>'type' = 'curtain') cc,
           (select count(*) from li, jsonb_array_elements(li.li) x where x->>'type' = 'blind') bc,
           (select coalesce(sum(jsonb_array_length(li.li)), 0) from li) n
  ),
  rel as (
    select (not (cc > 0 or bc > 0 or n > 0)) or cc > 0 hc, (not (cc > 0 or bc > 0 or n > 0)) or bc > 0 hb from cnt
  ),
  items(k, r) as (
    select 'fabric', hc from rel union all select 'production', hc from rel union all select 'blind', hb from rel
    union all select 'material', hc from rel union all select 'install', (hc or hb) from rel
  ),
  st as (select coalesce(p_order_status, '{}'::jsonb) os)
  select not exists (
    select 1 from items i, st
    where i.r and not (
      case when jsonb_typeof(st.os -> i.k) = 'object' then coalesce((st.os -> i.k ->> 'done')::boolean, false)
           else coalesce((st.os ->> i.k) = 'true', false) end)
  )
$f$;
SQL

$P -d $DB <<'SQL'
insert into customers values
 (1,'{}'),
 (2,'{"fabric":{"done":true,"vendor":"예원","orderDate":"2026-11-01"},"production":{"done":true},"material":{"done":true},"blind":{"done":true},"install":{"done":true}}'),
 (3,'{"blind":{"done":true,"vendor":"디테라"}}'),
 (4,'{"fabric":"true"}'),
 (5,null);
insert into estimates(client_id,is_archived,line_items) values
 (3,false,'[{"type":"blind"}]'),(4,false,'[{"type":"curtain"}]'),(4,true,'[{"type":"blind"}]'),(5,false,'[]');
SQL
$P -d $DB -f 2026-11-16_n176_order_overview_apply.sql && echo "✅ 적용(자동 검증 포함) 성공" || { echo "❌ 적용 실패"; fail=1; }
ok "고객3(블라인드만): 필요=블라인드·시공 / 끝=블라인드" "$($P -d $DB -c "select string_agg(kind||':'||relevant||':'||done||':'||coalesce(vendor,'-'),',' order by kind) from dah_order_overview(3)")" "blind:true:true:디테라,fabric:false:false:-,install:true:false:-,material:false:false:-,production:false:false:-"
ok "고객2(전부 끝, 거래처·발주일 읽힘)" "$($P -d $DB -c "select vendor||'/'||order_date from dah_order_overview(2) where kind='fabric'")" "예원/2026-11-01"
ok "고객4(옛 문자열 true 형식, 보관된 블라인드 견적 무시)" "$($P -d $DB -c "select done||':'||relevant from dah_order_overview(4) where kind='fabric'; select relevant from dah_order_overview(4) where kind='blind'" | tr '\n' ' ')" "true:true f "
ok "고객1(견적 없음 → 5종 전부 필요)" "$($P -d $DB -c "select count(*) from dah_order_overview(1) where relevant")" "5"
ok "함수 결과 = 기존 dah_order_complete (5명)" "$($P -d $DB -c "select count(*) from customers c where coalesce((select bool_and(done or not relevant) from dah_order_overview(c.id)),true) is distinct from dah_order_complete(c.id,c.order_status)")" "0"
$P -d $DB -f 2026-11-16_n176_order_overview_rollback.sql
ok "되돌리기 후 함수 없음" "$($P -d $DB -c "select count(*) from pg_proc where proname='dah_order_overview'")" "0"
ok "되돌리기 후 기존 함수는 그대로" "$($P -d $DB -c "select count(*) from pg_proc where proname='dah_order_complete'")" "1"
[ $fail = 0 ] && echo "=== 예행 전부 통과 ===" || { echo "=== 실패 있음 ==="; exit 1; }
