// H-30 예행(가짜 DB): 새 판정이 여러 견적서를 합쳐 보는지, 되돌리기가 되는지, 옛 정의가 실제로 틀렸는지(역검증)
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const R = new URL('.', import.meta.url).pathname;
const db = new PGlite(); const out = []; const ok = (l, c, d) => out.push((c ? '✅ ' : '❌ ') + l + (d ? ' — ' + d : ''));
await db.exec(`create table public.estimates(id serial primary key, client_id bigint, is_archived boolean default false, created_at timestamp default now(), line_items jsonb);`);
const add = (cid, items, arch = false, ts) => db.query('insert into public.estimates(client_id,line_items,is_archived,created_at) values ($1,$2,$3,$4)', [cid, JSON.stringify(items), arch, ts]);
const C = { type: 'curtain' }, B = { type: 'blind' }, O = { type: 'other' };
await add(1, [C, B], false, '2026-10-17 02:53'); await add(1, [O, O], false, '2026-10-17 03:03'); // 271 모양: 최신이 기타만
await add(2, [O], false, '2026-10-12 09:33');                                                    // 263 모양: 기타만
// 3번: 견적서 없음
await add(4, [C, B], true, '2026-10-01 00:00'); await add(4, [O], false, '2026-10-02 00:00');      // 보관된 C+B + 살아있는 기타
await add(5, [C], false, '2026-10-01 00:00'); await add(5, [], false, '2026-10-02 00:00');         // 빈 견적서가 섞임
const done = { fabric: { done: true }, production: { done: true }, blind: { done: true }, material: { done: true }, install: { done: true } };
const q = async (cid, os) => (await db.query('select public.dah_order_complete($1,$2) r', [cid, JSON.stringify(os)])).rows[0].r;
// 옛 정의 설치
await db.exec(fs.readFileSync(R + '2026-10-27_order_complete_union_rollback.sql', 'utf8'));
ok('역검증: 옛 정의는 271 모양(최신 기타만)을 발주 없이도 완료로 판정(=버그 재현)', (await q(1, {})) === true);
await db.exec(fs.readFileSync(R + '2026-10-27_order_complete_union_apply.sql', 'utf8'));
ok('새 정의: 271 모양, 발주 표시 없음 → 미완료', (await q(1, {})) === false);
ok('새 정의: 271 모양, 5개 전부 완료 → 완료', (await q(1, done)) === true);
ok('새 정의: 271 모양, 커튼 항목만 완료·블라인드 빠짐 → 미완료', (await q(1, { ...done, blind: { done: false } })) === false);
ok('새 정의: 기타만 있는 고객(263 모양) → 발주 불필요로 완료(기존 동작 유지)', (await q(2, {})) === true);
ok('새 정의: 견적서 없음 → 5개 필요, 표시 없으면 미완료', (await q(3, {})) === false);
ok('새 정의: 견적서 없음 → 5개 전부 완료면 완료', (await q(3, done)) === true);
ok('새 정의: 보관된 커튼·블라인드 견적은 무시 → 살아있는 기타만이면 완료', (await q(4, {})) === true);
ok('새 정의: 빈 견적서가 섞여도 커튼 견적 기준으로 판정', (await q(5, {})) === false && (await q(5, { fabric: { done: true }, production: { done: true }, material: { done: true }, install: { done: true } })) === true);
await db.exec(fs.readFileSync(R + '2026-10-27_order_complete_union_rollback.sql', 'utf8'));
ok('되돌린 뒤: 옛 동작 복원(271 모양 완료로 판정)', (await q(1, {})) === true);
console.log(out.join('\n')); const bad = out.some(l => l.startsWith('❌')); console.log(bad ? '\n❌ 실패 있음' : '\n✅ 모두 통과'); process.exit(bad ? 1 : 0);
