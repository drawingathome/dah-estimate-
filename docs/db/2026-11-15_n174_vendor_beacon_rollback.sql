-- N-174 되돌리기: vendor_list에서 '비콘' 항목만 제거(다른 거래처는 그대로)
begin;
update public.app_settings
   set value = (select coalesce(jsonb_agg(e), '[]'::jsonb)::text from jsonb_array_elements(value::jsonb) e where e->>'name' <> '비콘'),
       updated_at = now()
 where key = 'vendor_list';
commit;
