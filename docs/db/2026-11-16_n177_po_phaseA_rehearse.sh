#!/usr/bin/env bash
# N-177 ⓐ 가짜 DB 예행(운영 아님): 적용 → 건수·내용 확인 → 되돌리기 → 원상 확인
set -uo pipefail
cd "$(dirname "$0")"
P="psql -v ON_ERROR_STOP=1 -q -X -At -P pager=off"; DB=dah_n177_rehearse; fail=0
ok(){ if [ "$2" = "$3" ]; then echo "✅ $1"; else echo "❌ $1 — 기대 [$3] / 실제 [$2]"; fail=1; fi; }
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
$P -d $DB <<'SQL'
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
ok "이관 행 수(고객1: 원단2+제작1+블라인드1(대기), 고객2: 원단1+시공1, 고객3: 원단1, 고객6: 1)" "$($P -d $DB -c "select count(*) from dah_purchase_orders")" "8"
ok "고객1 원단 거래처 2곳으로 풀림" "$($P -d $DB -c "select string_agg(vendor_name,',' order by vendor_name) from dah_purchase_orders where customer_id=1 and category='원단'")" "디테라,비콘"
ok "거래처 빈칸 → 거래처 미상(NULL+메모) 3건" "$($P -d $DB -c "select count(*) from dah_purchase_orders where vendor_name is null and note like '거래처 미상%'")" "3"
ok "블라인드 '덱스터'는 대기 상태로(끝 아님)" "$($P -d $DB -c "select status from dah_purchase_orders where customer_id=1 and category='블라인드'")" "대기"
ok "옛 true 형식(고객3 원단)도 '발주'" "$($P -d $DB -c "select status from dah_purchase_orders where customer_id=3 and category='원단'")" "발주"
ok "날짜: 납기만 있는 고객2 원단은 납기 저장" "$($P -d $DB -c "select due_date from dah_purchase_orders where customer_id=2 and category='원단'")" "2026-09-19"
ok "원본 order_status 그대로" "$($P -d $DB -c "select md5(string_agg(id||order_status::text,'|' order by id)) from customers")" "$BEFORE"
$P -d $DB -f 2026-11-16_n177_po_phaseA_apply.sql >/dev/null 2>&1 && { echo "❌ 두 번째 적용이 막히지 않음"; fail=1; } || echo "✅ 다시 적용하면 막힘(이중 이관 방지)"
$P -d $DB -f 2026-11-16_n177_po_phaseA_rollback.sql && echo "✅ 되돌리기 실행"
ok "되돌린 뒤 표 0행" "$($P -d $DB -c "select count(*) from dah_purchase_orders")" "0"
ok "되돌린 뒤 추가 칸 없음" "$($P -d $DB -c "select count(*) from information_schema.columns where table_name='dah_purchase_orders' and column_name in ('vendor_name','source','legacy_key')")" "0"
ok "되돌린 뒤 원본 그대로" "$($P -d $DB -c "select md5(string_agg(id||order_status::text,'|' order by id)) from customers")" "$BEFORE"
[ $fail = 0 ] && echo "=== 예행 전부 통과 ===" || { echo "=== 실패 있음 ==="; exit 1; }
