-- N-174: 원단 거래처 목록(app_settings.vendor_list)에 '비콘' 추가 (선혜님 11-15 '비콘을 말했는데 왜 누락?')
-- 바뀌는 것: app_settings 'vendor_list' 한 줄의 목록 끝에 {"name":"비콘","categories":["fabric"]} 1개 추가. 다른 행·표·함수는 그대로.
-- 안전장치: 이미 '비콘'이 있으면 아무것도 안 함. 적용 뒤 개수가 15→16이 아니면 전체 취소.
begin;
update public.app_settings
   set value = ((value::jsonb) || '[{"name":"비콘","categories":["fabric"]}]'::jsonb)::text,
       updated_at = now()
 where key = 'vendor_list'
   and not exists (select 1 from jsonb_array_elements(value::jsonb) e where e->>'name' = '비콘');
do $$ declare n int; begin
  select jsonb_array_length(value::jsonb) into n from public.app_settings where key = 'vendor_list';
  if n <> 16 then raise exception '검증 실패: 거래처 수 % (16이어야 함) — 전체 취소', n; end if;
end $$;
commit;
