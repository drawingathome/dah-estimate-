// est-space-order.js
// 2026-10-21(선혜님 - 윤세현 견적서: "1층 2층 지하 공간별로 나누자고 했는데 고객용·실측요청서·시공요청서 공간 순서가 엉망"):
// 고객용 견적서 / 실측·시공 의뢰서 / 발주서가 공간 순서를 각자 다른 규칙으로 정하고 있었음
// (고객용=커튼 먼저 그다음 블라인드의 등장 순서, 의뢰서=등장 순서 안정정렬, 발주서=가나다순) → 같은 층이 여러 번 갈라져 나오고 문서마다 순서가 달랐음.
// 이제 세 문서가 이 함수 하나만 써서 항상 같은 순서가 나옴.
// 규칙: ① 층 순서 = 1층 → 2층 → 3층 … → 옥탑/다락 → 지하(마지막, 선혜님 결정 2026-10-21)
//       ② 층 표기가 없는 공간(예: "안방 침실")은 (가) 같은 첫 단어를 가진 층 표기 공간이 모두 같은 층이면 그 층("2층 안방 침실"이 있으면 "안방 …"은 전부 2층),
//          (나) 그런 공간이 없거나 층이 갈리면 목록에서 바로 앞 공간과 같은 층(앞이 없으면 1층)
//       ③ 같은 층 안에서는 입력한 순서(처음 나온 순서)를 유지, 같은 공간은 항상 붙어서 나옴
var EST_BASEMENT_LAST_RANK = 1000;
var EST_ATTIC_RANK = 900;
function estFloorRankFromText(space) {
  var s = String(space || '');
  var m = s.match(/지하|B\s*\d*\s*층?|(\d+)\s*층|옥탑|옥상|다락|루프탑/);
  if (!m) return null;
  if (/^지하/.test(m[0]) || /^B/i.test(m[0])) return EST_BASEMENT_LAST_RANK;
  if (/옥탑|옥상|다락|루프탑/.test(m[0])) return EST_ATTIC_RANK;
  return parseInt(m[1], 10);
}
// 층 표기·(외부) 등을 뗀 뒤 첫 단어("2층 안방 침실" → "안방")
function estSpaceCoreWord(space) {
  var s = String(space || '').replace(/\(외부\)|\(내부\)/g, ' ').replace(/지하|B\s*\d*\s*층?|\d+\s*층|옥탑|옥상|다락|루프탑/g, ' ').trim();
  var w = s.split(/\s+/)[0] || '';
  return w;
}
// spaces: 입력 순서대로 나열한 공간 이름 목록(중복 가능). 반환: { 공간이름: 정렬번호 } — 번호가 작을수록 먼저.
function estSpaceOrderMap(spaces) {
  var uniq = [];
  var seen = {};
  (spaces || []).forEach(function (sp) { var k = String(sp || ''); if (!(k in seen)) { seen[k] = true; uniq.push(k); } });
  var rank = {};
  var prev = null;
  // 첫 단어별로 층 표기 있는 공간들의 층 모음(모두 같은 층일 때만 사용)
  var wordFloors = {};
  uniq.forEach(function (sp) {
    var fr = estFloorRankFromText(sp); var w = estSpaceCoreWord(sp);
    if (fr !== null && w) { (wordFloors[w] = wordFloors[w] || {})[fr] = true; }
  });
  uniq.forEach(function (sp) {
    var r = estFloorRankFromText(sp);
    if (r === null) {
      var w = estSpaceCoreWord(sp), fl = w && wordFloors[w] ? Object.keys(wordFloors[w]) : [];
      if (fl.length === 1) r = parseInt(fl[0], 10);
      else r = (prev === null ? 1 : prev);
    }
    rank[sp] = r; prev = r;
  });
  var idx = {};
  uniq.forEach(function (sp, i) { idx[sp] = i; });
  var sorted = uniq.slice().sort(function (a, b) { return (rank[a] - rank[b]) || (idx[a] - idx[b]); });
  var order = {};
  sorted.forEach(function (sp, i) { order[sp] = i; });
  return order;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { estSpaceOrderMap: estSpaceOrderMap, estFloorRankFromText: estFloorRankFromText };
