-- 되돌리기(스위치만): 이동 규칙을 기록전용으로 복귀. 이미 옮겨진 고객 단계·금액·입금은 건드리지 않음.
-- [11-01 정정] 실제 켜기 때 스냅샷은 표(stage_on_snapshot)가 아니라 app_settings 한 줄(key 'stage_on_snapshot_2026-11-02',
--  값 = {고객번호: 단계})로 저장했음(이 화면에서 표 만들기가 자동 취소되어서). 아래 복원 목록도 그 한 줄 기준.
update public.app_settings set value = '"shadow"'::jsonb where key = 'stage_rule_mode';
select public.dah_stage_rule_mode() as 모드;

-- 복원 목록(읽기만): 스냅샷과 단계가 달라진 고객. 이 목록을 선혜님이 확인·승인한 뒤에만 아래 복원 SQL을 실행.
select c.id, c.client_name, s.value->>c.id::text as 복원할단계, c.stage as 현재단계
from public.customers c, (select value from public.app_settings where key='stage_on_snapshot_2026-11-02') s
where (s.value->>c.id::text) is distinct from c.stage and s.value ? c.id::text order by c.id;

-- (주의: 위 스위치를 먼저 shadow로 돌렸으므로 복원 중 자동 이동 규칙이 다시 끼어들지 않음)
-- [선혜님 승인 후에만 실행] 복원 SQL (주석 해제):
-- update public.customers c set stage = s.value->>c.id::text
--   from (select value from public.app_settings where key='stage_on_snapshot_2026-11-02') s
--   where s.value ? c.id::text and (s.value->>c.id::text) is distinct from c.stage;
