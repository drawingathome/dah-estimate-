-- 2026-10-23 백업 1000건 잘림 수정: 표 전체를 jsonb 배열 1개로 반환(행 수 제한 없음). 운영 적용 완료.
create or replace function public.dah_backup_export_all(table_name text) returns jsonb language plpgsql security definer set search_path to 'public' as $f$ declare r jsonb; begin execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from %I t', table_name) into r; return r; end; $f$;
revoke all on function public.dah_backup_export_all(text) from public, anon, authenticated;
grant execute on function public.dah_backup_export_all(text) to service_role;
