-- ============================================================
-- [초안·미적용] 단계 자동 이동 켜기 (shadow → on) — 11-02 적용 예정, 선혜님 승인 후 선혜님이 직접 실행(B 방식)
-- 전문업체 방식: ①켜기 직전 스냅샷 ②예상 이동 목록 확인 ③켠 직후 읽기 확인 ④되돌림 기준 ⑤복원 목록
-- 순서: 이 파일 전체를 한 번에 실행 → 마지막 SELECT 2개 결과를 Claude에게 전달
-- 되돌리기: 2026-11-02_stage_rule_on_rollback.sql
-- ============================================================
begin;

-- ① 스냅샷: 켜기 직전 모든 고객의 단계를 저장(복원 목록의 기준)
create table if not exists public.stage_on_snapshot (
  id bigserial primary key,
  batch text not null,
  customer_id bigint not null,
  stage text,
  taken_at timestamptz not null default now()
);
alter table public.stage_on_snapshot enable row level security;
drop policy if exists stage_on_snapshot_select on public.stage_on_snapshot;
create policy stage_on_snapshot_select on public.stage_on_snapshot for select
  using (exists (select 1 from public.staff_profiles p where p.id = (select auth.uid()) and p.role = 'master'));

insert into public.stage_on_snapshot(batch, customer_id, stage)
select 'stage_on_2026-11-02', c.id, c.stage from public.customers c;

-- 켜기
update public.app_settings set value = '"on"'::jsonb where key = 'stage_rule_mode';

-- 전 고객 재판정(켜기 직후 규칙을 한 번 적용)
select public.dah_recheck_customer_stage(c.id) from public.customers c;

commit;

-- ② 읽기 확인 1: 스위치 값과 스냅샷 건수
select public.dah_stage_rule_mode() as 모드,
       (select count(*) from public.stage_on_snapshot where batch='stage_on_2026-11-02') as 스냅샷건수,
       (select count(*) from public.customers) as 고객수;

-- ③ 읽기 확인 2: 실제로 옮겨진 고객(스냅샷 대비) — 예상 목록 외에 있으면 되돌림 기준 발동
select c.id, s.stage as 이전단계, c.stage as 현재단계
from public.customers c join public.stage_on_snapshot s on s.customer_id = c.id and s.batch='stage_on_2026-11-02'
where s.stage is distinct from c.stage order by c.id;
