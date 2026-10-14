-- 2026-10-15 S3: payment_ledger(비어 있고 아직 안 쓰는 표)의 INSERT를 마스터 전용으로 좁힘(운영 DB 적용 완료). 쓰기 시작할 때 다시 설계.
-- 되돌리기: alter policy payment_ledger_insert on public.payment_ledger with check (원래 조건: 마스터이거나 본인 담당 staff_name).
alter policy payment_ledger_insert on public.payment_ledger
  with check (exists (select 1 from public.staff_profiles s where s.id = auth.uid() and s.role = 'master'));
