// DB 발주 완료 규칙(dah_order_complete + 시공일 합치기) 기대값 시험 — "화면 판정과 DB 규칙이 같은가"의 DB 쪽 절반.
//  - 시나리오(tests/fixtures/order-rule-scenarios.json)를 임시 PostgreSQL의 운영 함수(db/test/live_order_rule.sql)에 넣어
//    '아직 안 끝난 발주가 있나(incomplete)'를 구해 db/test/order_rule_expected.json과 비교한다.
//  - 화면(JS) 쪽 절반은 tests/order-rule-parity-check.js 가 같은 시나리오·같은 기대값 파일로 비교한다.
//  - 두 시험이 같은 기대값 파일에 맞으면 DB와 화면은 같은 답을 낸다.
// 사용: node db/test/order_rule_parity.js [--write]   (접속은 PGHOST/PGPORT/PGUSER/PGPASSWORD 환경변수. 운영과 무관한 임시 DB를 만들고 지움)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.resolve(__dirname, '../..');
const scen = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/order-rule-scenarios.json'), 'utf8'));
const expPath = path.join(__dirname, 'order_rule_expected.json');
const DB = 'dah_order_parity_test';
const psql = (db, args, input) => cp.execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', '-X', '-At', '-P', 'pager=off', '-d', db, ...args], { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
psql('postgres', ['-c', `drop database if exists ${DB}`, '-c', `create database ${DB}`]);
let result;
try {
  psql(DB, ['-f', path.join(__dirname, '01_schema.sql')]);
  psql(DB, ['-f', path.join(__dirname, 'live_order_rule.sql')]);
  let sql = 'begin;\n';
  scen.forEach((s, i) => {
    const id = i + 1;
    const os = s.orderStatus === null ? 'null' : q(JSON.stringify(s.orderStatus)) + '::jsonb';
    sql += `insert into public.customers(id, client_name, order_status, install_date, install_date_tbd) overriding system value values (${id}, ${q(s.name)}, ${os}, ${q(s.installDate)}, ${s.installDateTbd});\n`;
    s.estimates.forEach(e => {
      const li = e.li === null ? 'null' : q(JSON.stringify(e.li)) + '::jsonb';
      sql += `insert into public.estimates(customer_name, client_id, line_items, is_archived) values (${q(s.name)}, ${id}, ${li}, ${!!e.archived});\n`;
    });
  });
  // dah_target_stage와 같은 합치기: 시공일이 있고 '미정'이 아니면 시공 항목은 완료
  sql += `select json_object_agg(c.client_name, not public.dah_order_complete(c.id,
      case when coalesce(c.install_date,'') <> '' and not coalesce(c.install_date_tbd,false)
           then coalesce(c.order_status,'{}'::jsonb) || '{"install":{"done":true}}'::jsonb else c.order_status end)) from public.customers c;\ncommit;\n`;
  const out = psql(DB, [], sql).trim().split('\n').filter(l => l.startsWith('{')).pop();
  result = JSON.parse(out);
} finally {
  try { psql('postgres', ['-c', `drop database if exists ${DB}`]); } catch (e) {}
}
if (process.argv.includes('--write')) {
  const sorted = Object.fromEntries(Object.keys(result).sort().map(k => [k, result[k]]));
  fs.writeFileSync(expPath, JSON.stringify(sorted, null, 0) + '\n');
  const t = Object.values(result).filter(Boolean).length;
  console.log(`기대값 ${Object.keys(result).length}개 기록 (아직 안 끝난 발주 있음 ${t} / 없음 ${Object.keys(result).length - t})`);
  process.exit(0);
}
const exp = JSON.parse(fs.readFileSync(expPath, 'utf8'));
const bad = scen.filter(s => exp[s.name] !== result[s.name]).map(s => `${s.name}: 기대 ${exp[s.name]} / DB ${result[s.name]}`);
console.log(bad.length ? '❌ DB 규칙 결과가 기대값과 다름 ' + bad.length + '건\n' + bad.slice(0, 10).join('\n') : `✅ DB 규칙 결과가 기대값과 모두 같음 (${scen.length}개)`);
process.exit(bad.length ? 1 : 0);
