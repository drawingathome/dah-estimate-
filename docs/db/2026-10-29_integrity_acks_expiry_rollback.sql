-- 되돌리기: 갱신 권한·정책과 기한 칸 제거(기한 칸 값은 사라짐. 기존 행·다른 칸은 그대로)
drop policy if exists integrity_acks_update_master on public.integrity_acks;
revoke update on public.integrity_acks from anon, authenticated;
alter table public.integrity_acks drop column if exists expires_at;
select count(*) as 건수 from public.integrity_acks;
