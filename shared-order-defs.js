// shared-order-defs.js — 발주 종류 '정의 한 곳' (두 앱 공용: dah-dashboard.html / dah-estimate.html)
// 2026-11-15 N-165 P3(선혜님 '흩어진 자료들은 모아'): 발주 종류(원단·제작·자재(레일)·블라인드)의 이름·서류 제목이
// 견적서 앱 5곳·대시보드 2곳에 따로 적혀 있어 한쪽만 고치면 화면끼리 어긋났음 → 여기 한 곳만 고치면 모두 바뀌게 모음.
// 주의: 이 파일은 '이름·순서'만 정의한다. 어떤 발주가 필요한가·끝났나 하는 '규칙'은 DB 함수 dah_order_complete와 JS(getRelevantOrderItems)에 아직 따로 있음(N-165 P4).
var DAH_ORDER_DEFS = [
  { key: 'fabric',     docTitle: '원단 발주서',           statusName: '원단',     noticeName: '원단',     emptyName: '원단',         vendorLabel: '원단' },
  { key: 'production', docTitle: '캔가공소(제작) 발주서', statusName: '제작',     noticeName: '제작',     emptyName: '캔가공소(제작)', vendorLabel: '제작' },
  { key: 'material',   docTitle: '레일·자재 발주서',      statusName: '자재',     noticeName: '레일',     emptyName: '레일',         vendorLabel: '자재' },
  { key: 'blind',      docTitle: '블라인드 발주서',       statusName: '블라인드', noticeName: '블라인드', emptyName: '블라인드',     vendorLabel: '블라인드' }
];
// 발주 종류 키 목록(서류 탭·완료 표시 순서)
function dahOrderKeys() { return DAH_ORDER_DEFS.map(function (d) { return d.key; }); }
// 한 종류의 이름/제목을 꺼냄(없는 종류면 fallback)
function dahOrderField(key, field, fallback) {
  for (var i = 0; i < DAH_ORDER_DEFS.length; i++) { if (DAH_ORDER_DEFS[i].key === key) return DAH_ORDER_DEFS[i][field] != null ? DAH_ORDER_DEFS[i][field] : fallback; }
  return fallback;
}
// { fabric: '원단', ... } 모양으로 한 이름 칸만 모아 줌
function dahOrderMap(field) { var o = {}; DAH_ORDER_DEFS.forEach(function (d) { o[d.key] = d[field]; }); return o; }
