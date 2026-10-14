-- 2026-10-14 전문업체 점검 보완: 이중 잠금(동작 변화 없음). RLS가 이미 비로그인 접근을 막고 있지만 표 권한 자체도 회수.
revoke all on public.monthly_close from anon;
revoke all on public.payment_ledger from anon;
revoke all on public.payment_refunds from anon;
revoke all on public.estimates_backup_20261009 from anon;
revoke execute on function public.guard_archived_estimate_payment() from public, anon, authenticated;
revoke execute on function public.guard_payment_reduction() from public, anon, authenticated;
revoke execute on function public.guard_staff_name_change() from public, anon, authenticated;
alter function public.payment_refunds_append_only() set search_path = 'public','pg_temp';
