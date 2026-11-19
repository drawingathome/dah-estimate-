-- N-186 되돌리기: v2 함수만 삭제(기존 check_phone_duplicate 2개는 그대로)
drop function if exists public.check_phone_duplicate_v2(text, text);
