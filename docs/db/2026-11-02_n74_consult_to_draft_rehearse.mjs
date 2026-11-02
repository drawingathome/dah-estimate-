// N-74 예행(가짜 DB): 상담·방문예약 + 견적서 → 가견적, 경계 사례, 되돌리기, 역검증
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const R = new URL('.', import.meta.url).pathname;
const db = new PGlite(); const out = []; const ok = (l, c, d) => out.push((c ? '✅ ' : '❌ ') + l + (d ? ' — ' + d : ''));
await db.exec(`
create table public.customers(id bigint primary key, stage text, deposit_amount numeric default 0, is_archived boolean default false,
  memo text, measure_date text default '', measure_date_tbd boolean default false, order_status jsonb default '{}');
create table public.estimates(id serial primary key, client_id bigint, is_archived boolean default false);
create table public.app_settings(key text primary key, value jsonb);
create function public.dah_customer_fully_paid(p bigint) returns boolean language sql as $$ select false $$;
create function public.dah_order_complete(p bigint, o jsonb) returns boolean language sql as $$ select false $$;
`);
const cust = (id, stage, o = {}) => db.query('insert into public.customers(id,stage,deposit_amount,is_archived,memo) values ($1,$2,$3,$4,$5)',
  [id, stage, o.dep ?? 0, o.arch ?? false, o.memo ?? '']);
const est = (cid, arch = false) => db.query('insert into public.estimates(client_id,is_archived) values ($1,$2)', [cid, arch]);
await cust(1, '상담'); await est(1);                         // 견적서 있는 상담 → 가견적
await cust(2, '방문예약'); await est(2);                      // 견적서 있는 방문예약 → 가견적
await cust(3, '상담');                                        // 견적서 없음 → 유지
await cust(4, '상담'); await est(4, true);                    // 보관된 견적서만 → 유지
await cust(5, '상담', { dep: 500000 }); await est(5);         // 선금 있음 → 이 규칙 제외(선금 이동은 별도 규칙)
await cust(6, '상담', { memo: '플러그에서 이관' }); await est(6); // 플러그 이관 → 유지
await cust(7, '상담', { arch: true }); await est(7);          // 보관된 고객 → 유지
await cust(8, '가견적'); await est(8);                        // 이미 가견적 → 변화 없음
await cust(9, '시공완료'); await est(9);                      // 뒤 단계 → 건드리지 않음
await cust(10, '상담'); await est(10, true); await est(10);   // 보관 1건 + 살아있는 1건 → 가견적
const target = async () => Object.fromEntries((await db.query('select id, public.dah_target_stage(c) t from public.customers c')).rows.map(r => [Number(r.id), r.t]));
// 옛 함수(되돌리기 파일)로 시작
await db.exec(fs.readFileSync(R + '2026-11-02_n74_consult_to_draft_rollback.sql', 'utf8').split('-- 2)')[0]);
let t = await target();
ok('역검증: 옛 규칙은 견적서가 있는 상담도 그대로 둔다(=공백 재현)', t[1] === '상담' && t[2] === '방문예약');
await db.exec(fs.readFileSync(R + '2026-11-02_n74_consult_to_draft_apply.sql', 'utf8'));
t = await target();
ok('상담 + 견적서 → 가견적', t[1] === '가견적');
ok('방문예약 + 견적서 → 가견적', t[2] === '가견적');
ok('견적서 없음 → 상담 유지', t[3] === '상담');
ok('보관된 견적서만 → 상담 유지', t[4] === '상담');
ok('선금 있는 고객은 이 규칙으로 안 움직임', t[5] === '상담');
ok('플러그 이관 고객 제외', t[6] === '상담');
ok('보관된 고객 제외', t[7] === '상담');
ok('이미 가견적 → 그대로', t[8] === '가견적');
ok('시공완료 같은 뒤 단계는 뒤로 안 감', t[9] === '시공완료');
ok('보관 1건 + 살아있는 1건 → 가견적', t[10] === '가견적');
const snap = (await db.query("select count(*)::int n from public.app_settings a, jsonb_object_keys(a.value) where a.key like 'n74_stage_snapshot_%'")).rows[0].n;
ok('스냅샷 표에 방문예약·상담 고객이 저장됨', snap === 8, '저장 ' + snap + '건');
await db.exec(fs.readFileSync(R + '2026-11-02_n74_consult_to_draft_rollback.sql', 'utf8').split('-- 2)')[0]);
t = await target();
ok('되돌린 뒤: 옛 동작 복원', t[1] === '상담' && t[2] === '방문예약');
console.log(out.join('\n')); const bad = out.some(l => l.startsWith('❌')); console.log(bad ? '\n❌ 실패 있음' : '\n✅ 모두 통과'); process.exit(bad ? 1 : 0);
