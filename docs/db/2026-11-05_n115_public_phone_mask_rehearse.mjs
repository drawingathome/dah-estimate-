// N-115 가짜 DB 예행: 번호 가림 + 나머지 열 그대로 + 보관 견적 제외 + 번호 형식 여러 가지 + 되돌리기 + 권한(실행 권한 유지)
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const R = new URL('.', import.meta.url).pathname;
const db = new PGlite(); const out = []; const ok = (l, c, d) => out.push((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || '')));
await db.exec(`
create role anon;
create table public.estimates(id uuid primary key, customer_name text, phone text, staff_name text, install_date text, estimate_status text, line_items jsonb, is_archived boolean default false);
insert into public.estimates values
 ('00000000-0000-4000-8000-000000000001','가림시험','010-7282-4432','마스터','2026-11-20','가견적','[{"a":1}]',false),
 ('00000000-0000-4000-8000-000000000002','붙여쓴번호','01012345678','오지은 실장',null,'확정','[]',false),
 ('00000000-0000-4000-8000-000000000003','공백있는번호','010 9999 0001','마스터',null,'가견적','[]',false),
 ('00000000-0000-4000-8000-000000000004','번호없음',null,'마스터',null,'가견적','[]',false),
 ('00000000-0000-4000-8000-000000000005','짧은번호','12','마스터',null,'가견적','[]',false),
 ('00000000-0000-4000-8000-000000000006','보관됨','010-1111-2222','마스터',null,'가견적','[]',true);
create function public.get_public_estimate(p_id uuid) returns table(customer_name text, phone text, staff_name text, install_date text, estimate_status text, line_items jsonb)
language plpgsql security definer set search_path to 'public','pg_temp' as $$ begin return query select e.customer_name, e.phone, e.staff_name, e.install_date, e.estimate_status, e.line_items from estimates e where e.id=p_id and e.is_archived=false; end; $$;
grant execute on function public.get_public_estimate(uuid) to anon;
`);
const get = async (n) => (await db.query('select * from public.get_public_estimate($1)', ['00000000-0000-4000-8000-00000000000' + n])).rows;
const before = (await get(1))[0];
ok('역검증: 적용 전에는 전화번호 전체가 그대로 내려옴(지금 운영과 같음)', before.phone === '010-7282-4432', before.phone);
await db.exec(fs.readFileSync(R + '2026-11-05_n115_public_phone_mask_apply.sql', 'utf8'));
const a = (await get(1))[0];
ok('적용 후: 뒤 4자리만(***-****-4432)', a.phone === '***-****-4432', a.phone);
ok('나머지 열(이름·담당·설치일·상태·품목)은 그대로', a.customer_name === '가림시험' && a.staff_name === '마스터' && a.install_date === '2026-11-20' && a.estimate_status === '가견적' && JSON.stringify(a.line_items) === '[{"a":1}]');
ok('붙여 쓴 번호(01012345678)도 가림', (await get(2))[0].phone === '***-****-5678');
ok('공백이 있는 번호(010 9999 0001)도 가림', (await get(3))[0].phone === '***-****-0001');
ok('번호 없음/4자리 미만은 빈 값(오류 없음)', (await get(4))[0].phone === '' && (await get(5))[0].phone === '');
ok('보관된 견적서는 여전히 안 보임(0행)', (await get(6)).length === 0);
const acl = (await db.query("select has_function_privilege('anon','public.get_public_estimate(uuid)','execute') x")).rows[0].x;
ok('익명(anon) 실행 권한이 그대로 유지됨(공개 링크가 계속 열림)', acl === true);
await db.exec(fs.readFileSync(R + '2026-11-05_n115_public_phone_mask_rollback.sql', 'utf8'));
ok('되돌린 뒤: 전화번호 전체 복원', (await get(1))[0].phone === '010-7282-4432');
console.log(out.join('\n')); const bad = out.some(l => l.startsWith('❌')); console.log(bad ? '\n❌ 실패 있음' : '\n✅ 모두 통과'); process.exit(bad ? 1 : 0);
