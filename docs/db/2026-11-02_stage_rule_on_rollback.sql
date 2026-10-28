-- 되돌리기(스위치만): 이동 규칙을 기록전용으로 복귀. 이미 옮겨진 고객 단계·금액·입금은 건드리지 않음.
update public.app_settings set value = '"shadow"'::jsonb where key = 'stage_rule_mode';
select public.dah_stage_rule_mode() as 모드;

-- 복원 목록(읽기만): 스냅샷과 단계가 달라진 고객. 이 목록을 선혜님이 확인·승인한 뒤에만 아래 복원 SQL을 실행.
select c.id, s.stage as 복원할단계, c.stage as 현재단계
from public.customers c join public.stage_on_snapshot s on s.customer_id = c.id and s.batch='stage_on_2026-11-02'
where s.stage is distinct from c.stage order by c.id;

-- (주의: 위 스위치를 먼저 shadow로 돌렸으므로 복원 중 자동 이동 규칙이 다시 끼어들지 않음)
-- [선혜님 승인 후에만 실행] 복원 SQL (주석 해제):
-- update public.customers c set stage = s.stage
--   from public.stage_on_snapshot s where s.customer_id = c.id and s.batch='stage_on_2026-11-02' and s.stage is distinct from c.stage;
