// est-space-order.js
// 2026-10-21(선혜님 - 시험타 견적서: "1층 2층 지하 공간별로 나누자고 했는데 고객용·실측요청서·시공요청서 공간 순서가 엉망"):
// 고객용 견적서 / 실측·시공 의뢰서 / 발주서가 공간 순서를 각자 다른 규칙으로 정하고 있었음
// (고객용=커튼 먼저 그다음 블라인드의 등장 순서, 의뢰서=등장 순서 안정정렬, 발주서=가나다순) → 같은 층이 여러 번 갈라져 나오고 문서마다 순서가 달랐음.
// 이제 세 문서가 이 함수 하나만 써서 항상 같은 순서가 나옴.
// 규칙: ① 층 순서 = 1층 → 2층 → 3층 … → 옥탑/다락 → 지하(마지막, 선혜님 결정 2026-10-21)
//       ② 층 표기가 없는 공간(예: "안방 침실")은 (가) 같은 첫 단어를 가진 층 표기 공간이 모두 같은 층이면 그 층("2층 안방 침실"이 있으면 "안방 …"은 전부 2층),
//          (나) 그런 공간이 없거나 층이 갈리면 목록에서 바로 앞 공간과 같은 층(앞이 없으면 1층)
//       ③ 같은 층 안에서는 방 종류 순서: 거실 → 안방(침실1) → 자녀방(침실2+) → 서재 → 드레스룸 → 주방 → (그 외: 복도·입구·베란다·화장실 등, 입력 순서) (선혜님 결정 2026-10-21)
//          같은 방(첫 단어가 같은 공간, 예: 안방 침실/안방 드레스룸/2층 안방 침실)은 붙어서 나옴. 같은 종류 안에서는 입력한 순서.
var EST_BASEMENT_LAST_RANK = 1000;
var EST_ATTIC_RANK = 900;
function estFloorRankFromText(space) {
  var s = String(space || '');
  var m = s.match(/지하|지층|반지하|B\s*\d*\s*층?|(\d+)\s*층|(\d+)\s*[Ff](?![A-Za-z])|옥탑|옥상|다락|루프탑/);
  if (!m) return null;
  if (/^(지하|지층|반지하)/.test(m[0]) || /^B/i.test(m[0])) return EST_BASEMENT_LAST_RANK;
  if (/옥탑|옥상|다락|루프탑/.test(m[0])) return EST_ATTIC_RANK;
  return parseInt(m[1] || m[2], 10);
}
// 층 표기·(외부) 등을 뗀 뒤 첫 단어("2층 안방 침실" → "안방")
function estSpaceCoreWord(space) {
  var s = String(space || '').replace(/\(외부\)|\(내부\)/g, ' ').replace(/지하|지층|반지하|B\s*\d*\s*층?|\d+\s*층|\d+\s*[Ff](?![A-Za-z])|옥탑|옥상|다락|루프탑/g, ' ').trim();
  var w = s.split(/\s+/)[0] || '';
  return w;
}
// 방 종류 순서(작을수록 먼저). 바꾸고 싶으면 이 목록만 수정. (선혜님 2026-10-21: 거실→안방→자녀방→서재→드레스룸→주방, 침실1=안방 자리·침실2 이상=자녀방 자리)
var EST_ROOM_ORDER = [/거실/, /안방|마스터/, /자녀|아이방|아기방|애기|키즈|딸|아들|아드님|따님|첫째|둘째|막내|놀이방/, /서재/, /드레스|옷방/, /주방|키친|부엌/];
var EST_ROOM_BEDROOM_MASTER = 1, EST_ROOM_BEDROOM_CHILD = 2; // 침실N 처리용(위 목록의 안방·자녀방 자리)
function estBedroomRank(s) {
  var m = String(s || '').match(/침실\s*(\d+)?/);
  if (!m) return -1;
  return (m[1] && parseInt(m[1], 10) >= 2) ? EST_ROOM_BEDROOM_CHILD : EST_ROOM_BEDROOM_MASTER;
}
function estRoomRank(space) {
  var w = estSpaceCoreWord(space), full = String(space || '');
  for (var i = 0; i < EST_ROOM_ORDER.length; i++) if (EST_ROOM_ORDER[i].test(w)) return i;
  var bw = estBedroomRank(w); if (bw >= 0) return bw;
  for (var j = 0; j < EST_ROOM_ORDER.length; j++) if (EST_ROOM_ORDER[j].test(full)) return j;
  var bf = estBedroomRank(full); if (bf >= 0) return bf;
  return EST_ROOM_ORDER.length;
}
// spaces: 입력 순서대로 나열한 공간 이름 목록(중복 가능). 반환: { 공간이름: 정렬번호 } — 번호가 작을수록 먼저.
var EST_TAIL_RANK = 2000;
// "전동모터 (블라인드)", "현장 아시바", "옵션 추가비"처럼 위치 칸에 비용 항목 이름을 적은 줄(층·방 단어가 하나도 없음)인지
function estIsNonSpaceName(name) {
  var n = String(name || '').trim();
  return !!n && n !== '—' && n !== '기타' && estFloorRankFromText(n) === null && estRoomRank(n) === EST_ROOM_ORDER.length;
}
// tailNames: { 이름: true } — 공간이 아니라 비용 항목이라 층·방 순서와 상관없이 맨 마지막(입력 순서)으로 보낼 이름들
function estSpaceOrderMap(spaces, tailNames) {
  var uniq = [];
  var seen = {};
  (spaces || []).forEach(function (sp) { var k = String(sp || ''); if (!(k in seen)) { seen[k] = true; uniq.push(k); } });
  var rank = {};
  var prev = null;
  // 첫 단어별로 층 표기 있는 공간들의 층 모음(모두 같은 층일 때만 사용)
  var wordFloors = {};
  uniq.forEach(function (sp) {
    if (tailNames && tailNames[sp]) return;
    var fr = estFloorRankFromText(sp); var w = estSpaceCoreWord(sp);
    if (fr !== null && w) { (wordFloors[w] = wordFloors[w] || {})[fr] = true; }
  });
  uniq.forEach(function (sp) {
    if (tailNames && tailNames[sp]) { rank[sp] = EST_TAIL_RANK; return; }
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
  // 같은 층·같은 방 종류 안에서는 같은 첫 단어끼리 붙이고(처음 나온 순서), 그다음 입력 순서
  var wordFirst = {};
  uniq.forEach(function (sp, i) { var k = rank[sp] + '|' + estSpaceCoreWord(sp); if (!(k in wordFirst)) wordFirst[k] = i; });
  var room = {};
  uniq.forEach(function (sp) { room[sp] = estRoomRank(sp); });
  var sorted = uniq.slice().sort(function (a, b) {
    return (rank[a] - rank[b]) || (room[a] - room[b]) ||
      (wordFirst[rank[a] + '|' + estSpaceCoreWord(a)] - wordFirst[rank[b] + '|' + estSpaceCoreWord(b)]) || (idx[a] - idx[b]);
  });
  var order = {};
  sorted.forEach(function (sp, i) { order[sp] = i; });
  return order;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { estSpaceOrderMap: estSpaceOrderMap, estIsNonSpaceName: estIsNonSpaceName, estRoomRank: estRoomRank, estFloorRankFromText: estFloorRankFromText };
