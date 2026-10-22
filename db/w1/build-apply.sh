#!/usr/bin/env bash
# apply_w1.sql 을 조각들로부터 조립한다. 조각(마이그레이션)이 바뀌면 이 스크립트를 다시 돌려 apply_w1.sql을 갱신할 것.
set -euo pipefail
cd "$(dirname "$0")"
R=../..
{
  echo "-- W1 운영 적용: 전체가 한 트랜잭션. 중간에 하나라도 실패하면 아무것도 바뀌지 않음. (build-apply.sh 로 자동 생성 — 직접 고치지 말 것)"
  echo "begin;"
  cat 00_pre_backup.sql
  echo "-- ① 단계·금액 자동 규칙"; cat $R/migration_stage_price_autosync.sql
  echo "-- ② 추가결제 보완"; cat $R/migration_2026_10_22_extra_payment_touch_customer.sql
  echo "-- ③ 확정 보호"; cat $R/migration_2026_10_22_estimate_confirm_guard.sql
  cat 90_post_check.sql
  echo "commit;"
} > "${1:-apply_w1.sql}"
