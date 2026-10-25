// tests/survey-to-customer-script-check.js
// 2026-10-25 전수표 T-15: 설문→고객 자동 등록 스크립트(구글 Apps Script)를 가짜 서버로 실행해 확인
//  1) 고객 등록이 서버에서 거절되면 설문을 '등록완료'로 바꾸면 안 됨(고객 유실 방지)
//  2) 중복 확인 조회가 실패하면 등록하지 않고 다음 실행으로 미룸(중복 고객 방지)
//  3) 같은 전화번호가 다른 표기(하이픈 유무)로 있어도 같은 고객으로 봄
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function runScenario(opts) {
  const calls = [];
  const ctx = {
    Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'KEY' }) },
    UrlFetchApp: {
      fetch(url, o) {
        const method = (o.method || 'get').toLowerCase();
        calls.push({ method, url, payload: o.payload });
        const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
        if (method === 'get' && url.indexOf('/surveys?') >= 0) return res(200, [{ id: 1, client_name: '시험', phone: opts.phone || '010-1234-5678' }]);
        if (method === 'get' && url.indexOf('/customers?') >= 0) {
          if (opts.lookupFail) return res(500, { message: 'x' });
          const q = decodeURIComponent(url.split('phone=in.')[1] || '');
          const hit = (opts.existing || []).some(p => q.indexOf('"' + p + '"') >= 0);
          return res(200, hit ? [{ id: 9, client_name: '기존' }] : []);
        }
        if (method === 'post') return opts.insertFail ? res(400, { message: 'bad' }) : res(201, [{ id: 10 }]);
        if (method === 'patch') return res(204, {});
        return res(200, []);
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', 'apps-script-survey-to-customer.js'), 'utf8'), ctx);
  vm.runInContext('processNewSurveys()', ctx);
  return calls;
}
const marked = c => c.some(x => x.method === 'patch' && x.url.indexOf('/surveys?') >= 0);
const inserted = c => c.some(x => x.method === 'post');
const log = [];
const ok = (l, c) => log.push((c ? '✅ ' : '❌ ') + l);

let c = runScenario({});
ok('1. 정상: 고객 등록 후 설문 처리완료 표시', inserted(c) && marked(c));
c = runScenario({ insertFail: true });
ok('2. 등록 거절: 설문을 처리완료로 바꾸지 않음(다음 실행에서 재시도)', inserted(c) && !marked(c));
c = runScenario({ lookupFail: true });
ok('3. 중복 조회 실패: 등록하지 않고 미룸', !inserted(c) && !marked(c));
c = runScenario({ phone: '010-1234-5678', existing: ['01012345678'] });
ok('4. 숫자만 저장된 같은 번호도 기존 고객으로 인식 → 새로 만들지 않음', !inserted(c) && marked(c));
c = runScenario({ phone: '01012345678', existing: ['010-1234-5678'] });
ok('5. 하이픈 저장된 같은 번호도 기존 고객으로 인식', !inserted(c) && marked(c));
log.forEach(l => console.log(l));
process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
