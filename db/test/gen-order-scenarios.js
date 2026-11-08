// 발주 완료 규칙 일치 시험용 시나리오 생성기 (입력만 만든다. 기대값은 order_rule_parity.js --write 가 DB 함수로 채운다).
// 실행: node db/test/gen-order-scenarios.js  → tests/fixtures/order-rule-scenarios.json
const fs = require('fs'), path = require('path');
const C = { type: 'curtain' }, B = { type: 'blind' }, O = { type: 'other' };
const estSets = {
  none: [],
  curtain: [{ li: [C] }],
  blind: [{ li: [B] }],
  both: [{ li: [C, B] }],
  otherOnly: [{ li: [O] }],
  emptyItems: [{ li: [] }],
  nullItems: [{ li: null }],
  twoSeparate: [{ li: [C] }, { li: [B] }],
  archivedCurtainLiveBlind: [{ li: [C], archived: true }, { li: [B] }],
  onlyArchived: [{ li: [C], archived: true }],
  curtainPlusEmpty: [{ li: [C] }, { li: [] }],
};
const K = ['fabric', 'production', 'blind', 'material', 'install'];
const all = v => Object.fromEntries(K.map(k => [k, v]));
const obj = (keys) => Object.fromEntries(keys.map(k => [k, { done: true }]));
const bool = (keys) => Object.fromEntries(keys.map(k => [k, true]));
const orderStatuses = {
  null: null, empty: {}, allBool: all(true), allObj: Object.fromEntries(K.map(k => [k, { done: true }])),
  curtainOnlyBool: bool(['fabric', 'production', 'material', 'install']),
  curtainOnlyObj: obj(['fabric', 'production', 'material', 'install']),
  blindOnlyBool: bool(['blind', 'install']),
  blindOnlyObj: obj(['blind', 'install']),
  onlyFabric: bool(['fabric']),
  allButInstall: bool(['fabric', 'production', 'blind', 'material']),
  mixed: { fabric: true, production: { done: true }, blind: { done: true }, material: true, install: { done: false } },
  falseVals: all(false),
  objNotDone: Object.fromEntries(K.map(k => [k, { done: false }])),
};
const installStates = { none: { d: '', tbd: false }, set: { d: '2026-11-20', tbd: false }, setTbd: { d: '2026-11-20', tbd: true }, tbdOnly: { d: '', tbd: true } };
const out = [];
for (const [en, es] of Object.entries(estSets)) for (const [on, os] of Object.entries(orderStatuses)) for (const [inn, ins] of Object.entries(installStates))
  out.push({ name: `${en}|${on}|${inn}`, estimates: es, orderStatus: os, installDate: ins.d, installDateTbd: ins.tbd });
fs.writeFileSync(path.join(__dirname, '../../tests/fixtures/order-rule-scenarios.json'), JSON.stringify(out));
console.log('시나리오 ' + out.length + '개 생성');
