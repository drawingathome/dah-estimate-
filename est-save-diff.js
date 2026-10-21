// est-save-diff.js
// 2026-10-21(W2 1단계 "바꾼 칸만 저장"): 이미 저장된 견적서를 수정 저장(PATCH)할 때, 열었던 시점의 서버 값과
// 같은 칸은 서버로 보내지 않는다. 화면이 일부 칸을 못 채운 채(불러오기 길이 3개, 옛 화면 등) 저장돼도
// 건드리지 않은 칸을 빈 값으로 덮어쓰지 못하게 하는 장치. (상세주소·확정이 조용히 사라지던 사고의 공통 구조)
// 항상 보내는 칸(금액·고객명)은 저장 때마다 계산한 값이 기준이라 그대로 보낸다.
var EST_SAVE_ALWAYS_KEYS = ['client_idempotency_key', 'customer_name', 'price', 'performance_revenue'];
function estNormForDiff(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') { return (/^-?\d+(\.\d+)?$/.test(v.trim())) ? String(Number(v)) : v; }
  try {
    var sortKeys = function (o) {
      if (Array.isArray(o)) return o.map(sortKeys);
      if (o && typeof o === 'object') { var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = sortKeys(o[k]); }); return r; }
      return o;
    };
    return JSON.stringify(sortKeys(v));
  } catch (e) { return String(v); }
}
// payload: 보낼 값들, baseRow: 열었던 시점의 서버 행. 반환: 바뀐 칸만 담은 새 객체(원본은 안 바꿈)
function estDropUnchangedColumns(payload, baseRow) {
  var out = {};
  Object.keys(payload).forEach(function (k) {
    if (payload[k] === undefined) return;
    if (EST_SAVE_ALWAYS_KEYS.indexOf(k) >= 0) { out[k] = payload[k]; return; }
    if (!baseRow || !Object.prototype.hasOwnProperty.call(baseRow, k)) { out[k] = payload[k]; return; }
    if (estNormForDiff(payload[k]) !== estNormForDiff(baseRow[k])) out[k] = payload[k];
  });
  return out;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { estDropUnchangedColumns: estDropUnchangedColumns, estNormForDiff: estNormForDiff };
