#!/usr/bin/env bash
# N-177 ⓐ 가짜 DB 예행(운영 아님): 적용 → 건수·내용 확인 → 되돌리기 → 원상 확인
set -uo pipefail
cd "$(dirname "$0")"
P="psql -v ON_ERROR_STOP=1 -q -X -At -P pager=off"; DB=dah_n177_rehearse; fail=0
ok(){ if [ "$2" = "$3" ]; then echo "✅ $1"; else echo "❌ $1 — 기대 [$3] / 실제 [$2]"; fail=1; fi; }
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
$P -d $DB <<'SQL'
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
create table public.customers(id bigint primary key, order_status jsonb);
create table public.estimates(id uuid primary key default gen_random_uuid());
create table public.dah_vendors(id bigint generated always as identity primary key, name text unique);
create table public.dah_purchase_orders(
 id bigint generated always as identity primary key, customer_id bigint not null references customers(id) on delete restrict,
 estimate_id uuid references estimates(id) on delete set null, category text not null check (category = any (array['원단','블라인드','부자재','제작','시공','실측'])),
 vendor_id bigint references dah_vendors(id), status text not null default '대기' check (status = any (array['대기','발주','입고','취소'])),
 order_date date, due_date date, note text, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
 check (due_date is null or order_date is null or due_date >= order_date));
insert into customers values
 (1,'{"fabric":{"done":true,"vendor":"디테라, 비콘","vendors":["디테라","비콘"],"orderDate":"2026-10-27"},"production":{"done":true,"vendor":"캔가공소","orderDate":"2026-10-27"},"blind":{"done":false,"vendor":"덱스터"}}'),
 (2,'{"fabric":{"done":true,"vendor":"","dueDate":"2026-09-19","orderDate":""},"install":{"done":true,"vendor":""}}'),
 (3,'{"fabric":true,"material":{"done":false,"vendor":""}}'),
 (4,'{}'),(5,null),
 (6,'{"measure":{"done":true,"vendor":"실측팀","orderDate":"2026-10-01","dueDate":"2026-10-03"}}');
SQL
BEFORE=$($P -d $DB -c "select md5(string_agg(id||order_status::text,'|' order by id)) from customers")
$P -d $DB -f 2026-11-16_n177_po_phaseA_apply.sql && echo "✅ 적용(자동 검증 포함) 성공" || { echo "❌ 적용 실패"; fail=1; }
ok "처음 복사 8행(고객1: 원단2+제작1+블라인드1(대기), 고객2: 2, 고객3: 1, 고객6: 1)" "$($P -d $DB -c "select count(*) from dah_purchase_orders where source='sync'")" "8"
ok "고객1 원단 거래처 2곳으로 풀림" "$($P -d $DB -c "select string_agg(vendor_name,',' order by vendor_name) from dah_purchase_orders where customer_id=1 and category='원단'")" "디테라,비콘"
ok "거래처 빈칸 → 거래처 미상 3건" "$($P -d $DB -c "select count(*) from dah_purchase_orders where vendor_name is null and note like '거래처 미상%'")" "3"
ok "블라인드 '덱스터'는 대기(끝 아님)" "$($P -d $DB -c "select status from dah_purchase_orders where customer_id=1 and category='블라인드'")" "대기"
ok "옛 true 형식(고객3 원단)도 '발주'" "$($P -d $DB -c "select status from dah_purchase_orders where customer_id=3 and category='원단'")" "발주"
ok "원본 order_status 그대로" "$($P -d $DB -c "select md5(string_agg(id||order_status::text,'|' order by id)) from customers")" "$BEFORE"
# --- 자동 따라가기(낡음 방지) ---
$P -d $DB -c "update customers set order_status='{\"blind\":{\"done\":true,\"vendor\":\"윈텍\",\"orderDate\":\"2026-11-16\"}}' where id=4"
ok "저장하면 새 표가 즉시 따라감(고객4 신규)" "$($P -d $DB -c "select vendor_name||'/'||status||'/'||order_date from dah_purchase_orders where customer_id=4")" "윈텍/발주/2026-11-16"
$P -d $DB -c "update customers set order_status='{\"fabric\":{\"done\":true,\"vendors\":[\"디테라\"],\"vendor\":\"디테라\"}}' where id=1"
ok "거래처를 빼면 새 표에서도 빠짐(고객1: 디테라만)" "$($P -d $DB -c "select string_agg(category||':'||vendor_name,',') from dah_purchase_orders where customer_id=1")" "원단:디테라"
$P -d $DB -c "update customers set order_status=null where id=6"
ok "기록을 지우면 새 표에서도 삭제(고객6)" "$($P -d $DB -c "select count(*) from dah_purchase_orders where customer_id=6")" "0"
$P -d $DB -c "insert into dah_purchase_orders(customer_id,category,vendor_name,status,source) values (3,'시공','직접입력','발주','manual')"
$P -d $DB -c "update customers set order_status='{\"fabric\":true}' where id=3"
ok "사람이 직접 넣은(manual) 행은 자동 갱신이 건드리지 않음" "$($P -d $DB -c "select count(*) from dah_purchase_orders where customer_id=3 and source='manual'")" "1"
# --- 동기화가 고장나도 고객 저장은 계속 ---
$P -d $DB -c "alter table dah_purchase_orders add constraint boom check (false) not valid"
$P -d $DB -c "update customers set order_status='{\"fabric\":{\"done\":true,\"vendor\":\"예원\"}}' where id=5" 2>/dev/null
ok "새 표 쪽이 고장 나도 고객 저장은 성공(고객5 저장됨)" "$($P -d $DB -c "select order_status->'fabric'->>'vendor' from customers where id=5")" "예원"
$P -d $DB -c "alter table dah_purchase_orders drop constraint boom"
# --- 고객 삭제가 막히지 않음 ---
$P -d $DB -c "delete from customers where id=2" && echo "✅ 새 표 행이 있는 고객도 삭제됨" || { echo "❌ 고객 삭제가 막힘"; fail=1; }
ok "삭제된 고객의 새 표 행도 함께 삭제" "$($P -d $DB -c "select count(*) from dah_purchase_orders where customer_id=2")" "0"
$P -d $DB -f 2026-11-16_n177_po_phaseA_rollback.sql >/dev/null 2>&1 && { echo "❌ manual 행이 있는데 되돌리기가 멈추지 않음"; fail=1; } || echo "✅ 사람이 넣은 행이 있으면 되돌리기가 멈춰 알려 줌"
$P -d $DB -c "delete from dah_purchase_orders where source='manual'"
$P -d $DB -f 2026-11-16_n177_po_phaseA_rollback.sql && echo "✅ 되돌리기 실행"
ok "되돌린 뒤 표 0행·추가 칸 없음" "$($P -d $DB -c "select (select count(*) from dah_purchase_orders)||'/'||(select count(*) from information_schema.columns where table_name='dah_purchase_orders' and column_name in ('vendor_name','source','legacy_key'))")" "0/0"
ok "되돌린 뒤 장치·함수 없음" "$($P -d $DB -c "select (select count(*) from pg_trigger where tgname like 'trg_dah_po_sync%')+(select count(*) from pg_proc where proname like 'dah_po_sync%')")" "0"
ok "되돌린 뒤 고객 연결이 원래(RESTRICT)" "$($P -d $DB -c "select confdeltype from pg_constraint where conname='dah_purchase_orders_customer_id_fkey'")" "r"
[ $fail = 0 ] && echo "=== 예행 전부 통과 ===" || { echo "=== 실패 있음 ==="; exit 1; }
