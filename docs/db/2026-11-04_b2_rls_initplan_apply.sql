-- B2 RLS 성능(초안, 미적용): 정책 안의 auth.uid()를 (select auth.uid())로 감싸 행마다 재계산되지 않게 함. 결과(보이는 행)는 동일.
-- 아직 감싸지 않은 auth.uid()가 있는 정책만 바꾼다(이미 감싼 정책은 그대로).
do $$
declare r record; q text; w text; stmt text;
begin
  for r in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := replace(replace(coalesce(r.qual, ''), 'SELECT auth.uid() AS uid', '@@W@@'), 'select auth.uid()', '@@W2@@');
    w := replace(replace(coalesce(r.with_check, ''), 'SELECT auth.uid() AS uid', '@@W@@'), 'select auth.uid()', '@@W2@@');
    if q like '%auth.uid()%' or w like '%auth.uid()%' then
      stmt := format('alter policy %I on public.%I', r.policyname, r.tablename);
      if r.qual is not null then
        stmt := stmt || ' using (' || replace(replace(replace(q, 'auth.uid()', '(select auth.uid())'), '@@W@@', 'SELECT auth.uid() AS uid'), '@@W2@@', 'select auth.uid()') || ')';
      end if;
      if r.with_check is not null then
        stmt := stmt || ' with check (' || replace(replace(replace(w, 'auth.uid()', '(select auth.uid())'), '@@W@@', 'SELECT auth.uid() AS uid'), '@@W2@@', 'select auth.uid()') || ')';
      end if;
      execute stmt;
    end if;
  end loop;
end $$;
