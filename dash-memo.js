/* ══════════════════════════════════════════════════
   DAH 대시보드 — 빠른 메모 문구 기능
   상담 메모 입력 시 자주 쓰는 문구를 버튼으로 빠르게 넣는 기능.
   ══════════════════════════════════════════════════ */

var DEFAULT_MEMO_PHRASES = [
  '네이버 예약', '쇼룸 방문', '전화 상담',
  '거실 커튼', '안방 블라인드', '내추럴 린넨 선호',
  '모던 심플', '재시공 문의', '신혼집',
];

function getMempoPhrases() {
  try {
    return JSON.parse(localStorage.getItem('dah_memo_phrases') || 'null') || DEFAULT_MEMO_PHRASES;
  } catch(e) { return DEFAULT_MEMO_PHRASES; }
}

function saveMemoPhrase(phrase) {
  var phrases = getMempoPhrases();
  if (!phrases.includes(phrase)) {
    phrases.unshift(phrase);
    if (phrases.length > 20) phrases = phrases.slice(0, 20);
    localStorage.setItem('dah_memo_phrases', JSON.stringify(phrases));
  }
}

function insertMemoPhrase(phrase) {
  var memoEl = document.getElementById('add-memo');
  if (!memoEl) return;
  var cur = memoEl.value;
  memoEl.value = cur ? cur + ' / ' + phrase : phrase;
  memoEl.focus();
}

function renderMemoPhrases() {
  var wrap = document.getElementById('memo-quick-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  getMempoPhrases().slice(0, 9).forEach(function(p) {
    var btn = document.createElement('button');
    btn.className = 'memo-quick-btn';
    btn.textContent = p;
    btn.onclick = function() { insertMemoPhrase(p); };
    wrap.appendChild(btn);
  });
}
