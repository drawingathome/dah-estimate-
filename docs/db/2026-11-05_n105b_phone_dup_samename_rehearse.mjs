// N-105② 가짜 DB 예행: 이름 같음/다름/없음, 보관 고객 무시, 여러 명 중 같은 이름 우선, 이름 비노출, 권한, 되돌리기
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const R = new URL('.', import.meta.url).pathname;
const db = new PGlite(); const out = []; const ok = (l, c, d) => out.push((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || '')));
await db.exec(`
create role anon; create role authenticated;
create table public.customers(id bigint primary key, client_name text, phone text, staff_name text, is_archived boolean default false);
insert into public.customers values (1,'임현정','010-7282-4432','오지은 실장',false),(2,'임가족','010-1111-2222','마스터',false),(3,'보관고객','010-3333-4444','마스터',true),(4,'동번호A','010-5555-6666','마스터',false),(5,'동번호B','010-5555-6666','오지은 실장',false);
create function public.check_phone_duplicate(phone_input text) returns table(exists_flag boolean, staff_name text) language sql security definer set search_path to 'public' as $$
 select true, c.staff_name from customers c where regexp_replace(c.phone,'\\D','','g')=regexp_replace(phone_input,'\\D','','g') and c.is_archived=false limit 1; $$;
grant execute on function public.check_phone_duplicate(text) to authenticated;
`);
await db.exec(fs.readFileSync(R + '2026-11-05_n105b_phone_dup_samename_apply.sql', 'utf8'));
const q = async (ph, nm) => (await db.query('select * from public.check_phone_duplicate($1,$2)', [ph, nm])).rows;
let r = await q('01072824432', '임현정'); ok('같은 번호·같은 이름 → 이름 같음(true)', r.length === 1 && r[0].exists_flag && r[0].same_name === true, JSON.stringify(r));
r = await q('010-7282-4432', ' 임현정 '); ok('앞뒤 공백·번호 모양이 달라도 같은 이름으로 인식', r[0] && r[0].same_name === true, JSON.stringify(r));
r = await q('01072824432', '다른가족'); ok('같은 번호·다른 이름 → 이름 다름(false), 담당자만 알려줌', r.length === 1 && r[0].same_name === false && r[0].staff_name === '오지은 실장', JSON.stringify(r));
ok('응답에 다른 사람 고객의 이름이 들어 있지 않음(열: exists_flag, staff_name, same_name뿐)', Object.keys(r[0]).sort().join(',') === 'exists_flag,same_name,staff_name', Object.keys(r[0]).join(','));
r = await q('01033334444', '보관고객'); ok('보관된 고객은 무시(0행)', r.length === 0, JSON.stringify(r));
r = await q('01055556666', '동번호B'); ok('같은 번호 고객이 둘이면 입력한 이름과 같은 쪽을 우선(same_name=true)', r.length === 1 && r[0].same_name === true, JSON.stringify(r));
r = await q('01099998888', '아무개'); ok('없는 번호 → 0행', r.length === 0);
r = (await db.query('select * from public.check_phone_duplicate($1)', ['01072824432'])).rows; ok('이름 없이 불러도 동작(same_name=false) — 예전 호출 방식 호환', r.length === 1 && r[0].same_name === false, JSON.stringify(r));
const priv = (await db.query("select has_function_privilege('anon','public.check_phone_duplicate(text,text)','execute') a, has_function_privilege('authenticated','public.check_phone_duplicate(text,text)','execute') b")).rows[0];
ok('익명은 실행 불가, 로그인 사용자만 가능', priv.a === false && priv.b === true, JSON.stringify(priv));
await db.exec(fs.readFileSync(R + '2026-11-05_n105b_phone_dup_samename_rollback.sql', 'utf8'));
const old = (await db.query('select * from public.check_phone_duplicate($1)', ['01072824432'])).rows;
ok('되돌린 뒤: 예전 함수(열 2개: exists_flag, staff_name)로 복원', old.length === 1 && Object.keys(old[0]).sort().join(',') === 'exists_flag,staff_name', JSON.stringify(old));
console.log(out.join('\n')); const bad = out.some(l => l.startsWith('❌')); console.log(bad ? '\n❌ 실패 있음' : '\n✅ 모두 통과'); process.exit(bad ? 1 : 0);
