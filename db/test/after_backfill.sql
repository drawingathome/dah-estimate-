select t.eq('B1 정리 후 뒤처진 고객 → 시공준비중', (select stage from customers where id=9006), '시공준비중');
select t.eq('B2 정리는 이관 고객을 건드리지 않음', (select stage||'/'||price from customers where id=9005), '시공완료/3320000');
select t.eq('B3 정리는 완납 아닌 고객을 건드리지 않음', (select stage from customers where id=9003), '확정견적');
