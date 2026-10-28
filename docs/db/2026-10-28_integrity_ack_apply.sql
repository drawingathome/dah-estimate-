-- [폐기 10-28 22:15] N-36 선혜님 결정(①)으로 이 초안은 쓰지 않음. 대체: 2026-10-29_integrity_acks_expiry_{apply,rollback}.sql (기존 integrity_acks에 기한 칸만 추가)
-- ============================================================
-- [제안·미적용] N-26 단계 1~2: 경고 "확인함" 표시 표 integrity_ack (2026-10-28)
-- 상태: 운영 DB에 실행하지 않았음. 선혜님 승인 후에만 적용. (가짜 DB 예행만 통과 = 운영 확인 아님)
-- 왜: 매일 점검 뷰(data_integrity_issues)의 경고를 마스터가 "확인함" 처리하면 접어 두고, 기한(expires_at)이 지나면 다시 띄우기 위한 기록 표.
-- 이 파일이 하는 일: 표 1개 + 보안 규칙(RLS) 추가뿐. 기존 표·뷰·트리거는 건드리지 않음 (뷰에서 확인 표시를 빼는 일은 N-26 다음 단계).
-- 열쇠: (경고 종류 code, 고객 번호 customer_id) 한 쌍당 확인 기록은 1개만 (중복 확인 방지). 기한이 지난 뒤 다시 확인하면 같은 줄을 UPDATE(갱신).
-- 권한: 마스터만 읽기·쓰기. 판별 방식은 기존 규칙과 동일 —
--       exists(select 1 from staff_profiles where id = (select auth.uid()) and role = 'master')   (2026-10-26_security_batch_apply.sql 과 같은 식)
--       로그인 안 한 사람(anon)은 표 권한 자체를 회수(revoke)하고, RLS에서도 auth.uid()가 없으면 거부 → 이중 잠금.
-- 한계: ORPHAN_ESTIMATE(연결된 고객이 없는 견적서)는 customer_id가 비어 있어 이 표로 확인 표시를 할 수 없음.
-- 되돌리기: 2026-10-28_integrity_ack_rollback.sql
-- ============================================================
create table if not exists public.integrity_ack (
  id          bigserial primary key,
  code        text        not null,                                  -- 경고 종류 (예: 'OVERPAID', 'MULTI_FINAL')
  customer_id bigint      not null references public.customers(id) on delete cascade,  -- 고객 번호 (고객 삭제 시 확인 기록도 함께 삭제)
  acked_by    uuid        not null default auth.uid(),               -- 확인한 사람(로그인 사용자 번호)
  acked_at    timestamptz not null default now(),                    -- 확인한 시각
  expires_at  timestamptz not null,                                  -- 이 시각이 지나면 경고가 다시 뜸
  reason      text,                                                  -- 확인 사유(메모)
  constraint integrity_ack_code_customer_key unique (code, customer_id),
  constraint integrity_ack_expires_after_acked check (expires_at > acked_at)
);

alter table public.integrity_ack enable row level security;

-- 표 권한: 로그인 안 한 사람(anon)은 아예 회수. 로그인한 사람(authenticated)은 RLS가 마스터만 통과시킴.
revoke all on public.integrity_ack from public, anon;
grant select, insert, update, delete on public.integrity_ack to authenticated;
grant usage, select on sequence public.integrity_ack_id_seq to authenticated;

drop policy if exists integrity_ack_master_all on public.integrity_ack;
create policy integrity_ack_master_all on public.integrity_ack for all
  using      (exists (select 1 from public.staff_profiles s where s.id = (select auth.uid()) and s.role = 'master'))
  with check (exists (select 1 from public.staff_profiles s where s.id = (select auth.uid()) and s.role = 'master')
              and acked_by = (select auth.uid()));   -- 남의 이름으로 확인 기록을 남길 수 없음
