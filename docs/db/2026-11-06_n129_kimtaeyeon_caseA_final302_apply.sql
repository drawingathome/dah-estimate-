-- N-129 경우 A: 오지은 실장이 '최종 견적은 1,122,000원(302의 견적서)'라고 확인했을 때. 미적용. 승인 전 실행 금지.
-- 301의 견적서(1,032,000원)와 301 고객 행을 삭제하지 않고 보관 처리. 조건이 하나라도 다르면 0건 반영.
begin;
update public.estimates set is_archived = true
 where id = 'cc4940ed-2e11-4122-8178-e096faa409a6' and client_id = 301 and price = 1032000 and coalesce(is_archived,false) = false;
update public.customers set is_archived = true
 where id = 301 and client_name = '김태연' and coalesce(is_archived,false) = false;
commit;
-- 확인(읽기): 301 보관·302 활성(price 1122000, 활성 견적 1건)
-- select c.id, c.is_archived, c.price, (select count(*) from estimates e where e.client_id=c.id and coalesce(e.is_archived,false)=false) est from customers c where c.id in (301,302) order by id;
