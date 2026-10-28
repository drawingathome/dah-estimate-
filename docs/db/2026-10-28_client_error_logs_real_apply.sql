-- N-25 오류 기록 소음 분리 — 적용 SQL (초안 / 운영 미적용)
-- 원본 표 client_error_logs 는 절대 바꾸지 않고, 진행 기록('저장단계: ...')을 뺀 "보기" 하나만 새로 만든다.
--
-- 규칙 근거(저장소 코드):
--   est-save.js:401-418 logSaveStage() → reportClientError('저장단계: ' + stage, null, {stage, detail, customerName})
--   est-utils.js:660-683 / dash-api.js:196-219 reportClientError → message 컬럼에 그대로 저장(2000자 절단)
--   apps-script-daily-backup.js:801-830 isRoutineStage() → 같은 접두어('저장단계: ')를 기준으로 정상 단계를 거르는 기존 규칙
--   상태코드 위치: extra.detail.status (apps-script-daily-backup.js 의 2026-10-07 주석, DB로 확인된 형태)
--
-- 안전장치: '저장단계:' 접두어라도 "문제 신호"는 보기에 남긴다(진행 기록 안에 섞인 진짜 실패를 숨기지 않기 위해).
--   남기는 것: 타임아웃 / 네트워크오류 / 예외 / 검증실패 / 세션확인-만료 / 버튼-고착감지,
--             그리고 '고객저장-응답'·'견적서저장-응답' 중 상태코드가 2xx가 아니거나 읽을 수 없는 것.
--
-- 적용 전 읽기 전용 확인(선혜님 승인 후 운영에서): 원본의 권한/정책이 아래 grant 와 같은 수준인지
--   select grantee, privilege_type from information_schema.role_table_grants where table_name='client_error_logs';
--   select policyname, cmd, roles, qual from pg_policies where tablename='client_error_logs';

create or replace view public.client_error_logs_real
with (security_invoker = true) as
select *
from public.client_error_logs l
where not (
  coalesce(l.message, '') like '저장단계: %'
  and coalesce(l.message, '') not like '%타임아웃%'
  and coalesce(l.message, '') not like '%네트워크오류%'
  and coalesce(l.message, '') not like '%예외%'
  and coalesce(l.message, '') not like '%검증실패%'
  and coalesce(l.message, '') not like '%세션확인-만료%'
  and coalesce(l.message, '') not like '%고착감지%'
  and not (
    l.message in ('저장단계: 고객저장-응답', '저장단계: 견적서저장-응답')
    and case
          when coalesce(l.extra #>> '{detail,status}', l.extra ->> 'status') ~ '^[0-9]+$'
          then coalesce(l.extra #>> '{detail,status}', l.extra ->> 'status')::int not between 200 and 299
          else true
        end
  )
);

comment on view public.client_error_logs_real is
  'N-25: client_error_logs 에서 정상 진행 기록(저장단계: ...)을 뺀 보기. security_invoker=true 라 원본 RLS 그대로 적용.';

-- 권한: 기본 권한을 모두 걷고, 원본을 읽을 수 있는 로그인 계층에만 SELECT. anon·PUBLIC 에는 주지 않음.
revoke all on public.client_error_logs_real from public, anon, authenticated;
grant select on public.client_error_logs_real to authenticated, service_role;
