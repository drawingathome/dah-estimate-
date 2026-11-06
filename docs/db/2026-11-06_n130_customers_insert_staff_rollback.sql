-- N-130 되돌리기: 예전 규칙(로그인만 되어 있으면 가능)으로 복원
begin;
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers for insert with check ((select auth.uid()) is not null);
commit;
