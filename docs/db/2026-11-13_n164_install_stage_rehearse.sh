#!/usr/bin/env bash
# N-164 가짜 DB 예행: 임시 PostgreSQL(운영 아님)에서 적용 전→적용→되돌리기를 돌려 '시공준비중' 판정이 의도대로인지 확인한다.
set -uo pipefail
cd "$(dirname "$0")"; R=../../db/test; TMPF=$(mktemp)
P="psql -v ON_ERROR_STOP=1 -q -X -At -P pager=off"; DB=dah_n164_rehearse; fail=0
ok(){ if [ "$2" = "$3" ]; then echo "✅ $1"; else echo "❌ $1 — 기대 [$3] / 실제 [$2]"; fail=1; fi; }
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
$P -d $DB <<'SQL'
create table public.customers(id bigint primary key, client_name text, stage text, is_archived boolean, memo text, deposit_amount numeric, measure_date text, measure_date_tbd boolean, install_date text, install_date_tbd boolean, order_status jsonb);
create table public.estimates(id serial primary key, client_id bigint, is_archived boolean, line_items jsonb);
create table public.t_paid(id bigint primary key, paid boolean);
create function public.dah_customer_fully_paid(p bigint) returns boolean language sql stable as $$ select coalesce((select paid from public.t_paid where id=p),false) $$;
SQL
$P -d $DB -f $R/live_order_rule.sql
# 운영 현재 규칙(N-141) 설치
python3 - <<'PY' > "$TMPF"
import re
s=open('2026-11-07_n141_install_order_apply.sql',encoding='utf-8').read()
print(re.search(r"create or replace function public\.dah_target_stage.*?end \$function\$;",s,re.S).group(0))
PY
$P -d $DB -f "$TMPF"
$P -d $DB <<'SQL'
-- 시나리오: 전부 '잔금결제'(입금 완료) 상태로 시작
insert into customers values
 (1,'시공일+발주전무','잔금결제',false,'',100,'2026-10-01',false,'2026-11-20',false,'{}'),
 (2,'시공일+원단만빠짐','잔금결제',false,'',100,'2026-10-01',false,'2026-11-20',false,'{"production":{"done":true},"material":{"done":true},"blind":{"done":true}}'),
 (3,'시공일없음+발주다함','잔금결제',false,'',100,'2026-10-01',false,'',false,'{"fabric":{"done":true},"production":{"done":true},"material":{"done":true},"blind":{"done":true},"install":{"done":true}}'),
 (4,'시공일미정','잔금결제',false,'',100,'2026-10-01',false,'2026-11-20',true,'{}'),
 (5,'보관된고객','잔금결제',true,'',100,'2026-10-01',false,'2026-11-20',false,'{}'),
 (6,'플러그이관','잔금결제',false,'Pluuug',100,'2026-10-01',false,'2026-11-20',false,'{}'),
 (7,'선금만','선금결제',false,'',100,'2026-10-01',false,'2026-11-20',false,'{}'),
 (8,'입금완료+시공일(확정견적에서)','확정견적',false,'',100,'2026-10-01',false,'2026-11-20',false,'{}'),
 (9,'이미시공준비중','시공준비중',false,'',100,'2026-10-01',false,'2026-11-20',false,'{}');
insert into t_paid values (1,true),(2,true),(3,true),(4,true),(5,true),(6,true),(8,true);
create view v as select id, public.dah_target_stage(c) t from customers c;
SQL
snap(){ $P -d $DB -c "select string_agg(id||':'||t, ',' order by id) from v"; }
BEFORE=$(snap)
ok "[적용 전] 옛 규칙: 시공일만 있고 발주가 안 끝난 1·2·4는 잔금결제에 머묾(문제 재현), 발주를 다 한 3은 시공준비중, 선금만(7)은 실측일 있어 실측준비중" "$BEFORE" "1:잔금결제,2:잔금결제,3:시공준비중,4:잔금결제,5:잔금결제,6:잔금결제,7:실측준비중,8:잔금결제,9:시공준비중"
APPLY_OUT=$($P -d $DB -f 2026-11-13_n164_install_stage_apply.sql 2>&1) && echo "✅ 적용(자동 검증 포함) 성공" || { echo "❌ 적용 실패: $APPLY_OUT"; fail=1; }
AFTER=$(snap)
ok "[적용 후] 시공일 있는 1·2·8은 시공준비중, 시공일 없음(3, 발주를 다 했어도)·미정(4)·보관(5)·플러그(6)는 잔금결제, 선금만(7)은 실측준비중 그대로" "$AFTER" "1:시공준비중,2:시공준비중,3:잔금결제,4:잔금결제,5:잔금결제,6:잔금결제,7:실측준비중,8:시공준비중,9:시공준비중"
# 입금 미완료(확정견적, 시공일 있음)는 시공준비중으로 안 감
$P -d $DB -c "insert into customers values (10,'입금미완료+시공일','확정견적',false,'',100,'2026-10-01',false,'2026-11-20',false,'{}')"
ok "입금이 안 끝났으면 시공일이 있어도 시공준비중으로 안 감" "$($P -d $DB -c "select t from v where id=10")" "확정견적"
$P -d $DB -f 2026-11-13_n164_install_stage_rollback.sql >/dev/null 2>&1 && echo "✅ 되돌리기 성공" || { echo "❌ 되돌리기 실패"; fail=1; }
AFTER_RB=$(snap | sed 's/,10:[^,]*//' )
ok "[되돌린 뒤] 적용 전과 같은 판정" "$(snap | sed 's/,10:[^,]*//')" "$BEFORE"
$P -d postgres -c "drop database if exists $DB"
[ -n "$BEFORE" ] || fail=1
[ $fail = 0 ] && echo "✅ 예행 모두 통과" || echo "❌ 예행 실패 있음"; exit $fail
