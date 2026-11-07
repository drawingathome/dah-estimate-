-- 삭제 가드만 제거(기록 표는 유지)
drop trigger if exists trg_closed_month_delete_guard on public.estimates;
drop function if exists public.dah_closed_month_delete_guard();
