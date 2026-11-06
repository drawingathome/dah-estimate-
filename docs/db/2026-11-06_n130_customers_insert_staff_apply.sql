-- N-130: 고객 새로 만들기(INSERT) 규칙을 좁힘. 미적용 초안(RLS라 선혜님이 SQL Editor에서 실행, 승인 전 금지).
-- 예전: 로그인만 되어 있으면 담당자 이름을 아무거나 넣고 만들 수 있었음(실장 계정으로 '마스터 담당' 고객 생성 가능 → 실장에게 안 보여 중복 확인을 피함).
-- 새 규칙: 마스터이거나, 담당자가 '내 이름'이거나 '미배정'일 때만 만들 수 있음. (조회·수정·삭제 규칙은 그대로)
-- 앱 확인: 견적서 앱은 저장 때 로그인한 사람 이름으로 담당자를 덮어쓰고, 대시보드 고객 추가 화면은 실장 계정이면 담당자 칩이 잠겨 본인 이름 고정 → 정상 사용은 영향 없음.
begin;
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers for insert
  with check (
    (select auth.uid()) is not null
    and (
      exists (select 1 from public.staff_profiles sp where sp.id = (select auth.uid()) and sp.role = 'master')
      or staff_name = (select sp.display_name from public.staff_profiles sp where sp.id = (select auth.uid()))
      or staff_name = '미배정'
    )
  );
commit;
