-- 되돌리기: 적용 전에 저장해 둔 원래 문장을 글자 그대로 복원한다(백업이 없으면 중단).
do $$
declare b jsonb; e jsonb; stmt text;
begin
  execute 'set local lock_timeout = ''3s''';
  select value into b from public.app_settings where key = 'b2_policy_backup_20261104';
  if b is null then raise exception '백업(b2_policy_backup_20261104)이 없어 되돌릴 수 없음'; end if;
  for e in select * from jsonb_array_elements(b) loop
    stmt := format('alter policy %I on public.%I', e->>'p', e->>'t');
    if e->>'q' is not null then stmt := stmt || ' using (' || (e->>'q') || ')'; end if;
    if e->>'w' is not null then stmt := stmt || ' with check (' || (e->>'w') || ')'; end if;
    execute stmt;
  end loop;
end $$;
