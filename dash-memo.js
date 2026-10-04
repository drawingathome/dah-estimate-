/* ══════════════════════════════════════════════════
   DAH 대시보드 — 빠른 메모 문구 기능
   상담 메모 입력 시 자주 쓰는 문구를 버튼으로 빠르게 넣는 기능.
   ══════════════════════════════════════════════════ */

var DEFAULT_MEMO_PHRASES = [
  '예약확인 발송', '가견적서 발송', '계약금요청 발송',
  '실측일정 확정 발송', '확정견적서 발송', '잔금요청 발송',
  '제작안내 발송', '시공일정 확정 발송', '취소 안내 발송',
  '일정 변경 요청', '노쇼 재예약 안내 발송',
];

function getMempoPhrases() {
  try {
    return JSON.parse(localStorage.getItem('dah_memo_phrases') || 'null') || DEFAULT_MEMO_PHRASES;
  } catch(e) { return DEFAULT_MEMO_PHRASES; }
}

// 설정탭에서 전체 목록을 교체할 때 사용 (클라우드 동기화 포함)
function setMemoPhrasesList(phrases) {
  try { localStorage.setItem('dah_memo_phrases', JSON.stringify(phrases)); } catch(e){}
  if (typeof sbSyncSetting === 'function') sbSyncSetting('memo_phrases', phrases);
}

// 2026-08-28(선혜님 확인 - "이 기능은 스킵"): 아래 3개 함수(saveMemoPhrase/
// insertMemoPhrase/renderMemoPhrases)는 원래 "고객 추가" 모달의 메모칸에
// 빠른문구 버튼을 붙이려고 만든 것인데, 그 메모칸이 hidden 필드로 바뀌면서
// 붙을 자리가 없어져 죽은 코드가 됐음. 참고로 "빠른 문구" 기능 자체는
// 죽지 않고 고객상세 화면의 메모칸(dash-customer-detail.js)에서 이미 다른
// 방식으로 살아 쓰이고 있음 - 그쪽은 getMempoPhrases/setMemoPhrasesList를
// 그대로 재사용하므로 이 두 함수는 유지, 여기 3개만 제거.

