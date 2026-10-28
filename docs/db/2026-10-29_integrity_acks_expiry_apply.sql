-- ============================================================
-- [제안·미적용] N-36 / N-26 개정(선혜님 10-28 22:15 '①' 결정): 기존 "확인함" 표 integrity_acks에 기한 칸만 추가
-- 상태: 운영 DB에 실행하지 않았음. 선혜님 승인 후에만 적용. (가짜 DB 예행 통과 = 운영 확인 아님)
-- 대체: 2026-10-28_integrity_ack_apply.sql(새 표 integrity_ack를 따로 만드는 초안)은 폐기. 이름이 거의 같은 표가 둘이 되는 것을 막기 위함.
-- 하는 일(최소): ①expires_at 칸 추가(비어 있음 = 기한 없음 = 지금 동작 그대로, 기존 행 값 불변) ②마스터만 기한·메모를 갱신(UPDATE)할 수 있게 함
-- 하지 않는 일: 표 새로 만들기·행 삭제·기존 읽기/쓰기 규칙 변경·뷰 변경(뷰가 기한을 보고 경고를 다시 띄우는 일은 다음 단계)
-- 운영 읽기로 확인한 현재 상태(10-28): 열쇠=ack_key(text), RLS 켜짐, authenticated에 INSERT·SELECT만, 정책 insert/select 2개, 트리거 0, 5건
-- 되돌리기: 2026-10-29_integrity_acks_expiry_rollback.sql
-- ============================================================
alter table public.integrity_acks add column if not exists expires_at timestamptz;

-- 갱신(UPDATE)은 마스터만, 기한·메모·확인 시각 칸만
revoke update on public.integrity_acks from anon, authenticated;
grant update (expires_at, note, acked_at) on public.integrity_acks to authenticated;
drop policy if exists integrity_acks_update_master on public.integrity_acks;
create policy integrity_acks_update_master on public.integrity_acks for update to authenticated
  using (exists (select 1 from public.staff_profiles p where p.id = (select auth.uid()) and p.role = 'master'))
  with check (exists (select 1 from public.staff_profiles p where p.id = (select auth.uid()) and p.role = 'master'));

select count(*) as 건수, count(expires_at) as 기한있는건수 from public.integrity_acks;
