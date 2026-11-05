-- N-113 되돌리기: 함수만 지움(데이터 영향 없음). 앱은 함수가 없으면 예전 방식(견적서→고객 두 번 요청)으로 자동 대체됨.
drop function if exists public.dah_delete_customer(bigint);
