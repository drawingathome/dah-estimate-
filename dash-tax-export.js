// dash-tax-export.js
// ══════════════════════════════════════════════════
// 2026-10-14(4-21 세무사용 월별 자료): 한 달 동안의 "입금·환불" 내역을 세무사에게 줄 수 있는 CSV로 내보냄(마스터 전용).
// - 입금: 선금/잔금 입금일이 그 달인 건(견적서별). 환불: 환불일이 그 달인 건을 마이너스 금액으로.
// - 칸: 날짜, 고객명, 담당자, 구분, 금액, 결제방법, 현금영수증/세금계산서 발행 표시, 비고. 맨 아래에 합계·결제방법별 합계.
// - 견적서에 입금 기록이 전혀 없는 예전 고객은 고객 칸의 입금을 사용(getAllEstPays와 같은 규칙).
// - 앱 안의 기록 기준이라 통장·카드사와 일치하는지는 "설정 > 입금 대조"로 따로 확인. 세무 신고 자체를 대신하지 않음.
// ══════════════════════════════════════════════════

/**
 * @param {Array<any>} customers 고객 목록(보관 제외된 것)
 * @param {Array<any>} estimates 견적서 목록(dah_saved 형식, refundRows 포함)
 * @param {string} month 'YYYY-MM'
 * @returns {Array<{date:string, customer:string, staff:string, kind:string, amount:number, method:string, receipt:string, note:string}>}
 */
function taxBuildMonthRows(customers, estimates, month) {
  var rows = [];
  var prefix = String(month || '');
  function inMonth(d) { return !!d && String(d).slice(0, 7) === prefix; }
  function receiptLabel(v) { return v ? '발행/요청' : ''; }
  (customers || []).forEach(function (c) {
    var mine = (estimates || []).filter(function (e) { return (c.id && e.clientId) ? e.clientId === c.id : e.clientName === c.clientName; });
    var estPaid = mine.reduce(function (s, e) { return s + (Number(e.depositAmount) || 0) + (Number(e.balanceAmount) || 0); }, 0);
    var custPaid = (Number(c.depositAmount) || 0) + (Number(c.balanceAmount) || 0);
    var sources = (mine.length && !(estPaid === 0 && custPaid > 0)) ? mine : [c];
    sources.forEach(function (e) {
      var base = { customer: c.clientName || '', staff: c.staffName || '' };
      var dep = Number(e.depositAmount) || 0, bal = Number(e.balanceAmount) || 0;
      if (dep > 0 && inMonth(e.depositDate)) rows.push({ date: String(e.depositDate).slice(0, 10), customer: base.customer, staff: base.staff, kind: '선금', amount: dep, method: e.depositMethod || '', receipt: receiptLabel(e.depositReceipt), note: '' });
      if (bal > 0 && inMonth(e.balanceDate)) rows.push({ date: String(e.balanceDate).slice(0, 10), customer: base.customer, staff: base.staff, kind: '잔금', amount: bal, method: e.balanceMethod || '', receipt: receiptLabel(e.balanceReceipt), note: '' });
      var refunds = (typeof getEffectiveRefunds === 'function') ? getEffectiveRefunds(e) : [];
      refunds.forEach(function (r) {
        var amt = Number(r.amount) || 0;
        if (amt > 0 && inMonth(r.refundDate)) rows.push({ date: String(r.refundDate).slice(0, 10), customer: base.customer, staff: base.staff, kind: '환불', amount: -amt, method: '', receipt: '', note: (r.slot === 'balance' ? '잔금' : '선금') + ' 환불(원 입금일 ' + (r.paidDate || '?') + ')' });
      });
    });
  });
  rows.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.customer < b.customer ? -1 : 1); });
  return rows;
}

/**
 * CSV 문자열 만들기(맨 아래 합계 포함). 엑셀에서 한글이 깨지지 않게 호출하는 쪽에서 BOM을 붙임.
 * @param {Array<any>} rows taxBuildMonthRows 결과
 * @param {string} month
 * @returns {string}
 */
function taxRowsToCsv(rows, month) {
  var safe = (typeof csvSafeCell === 'function') ? csvSafeCell : function (x) { return String(x); };
  var out = [['날짜', '고객명', '담당자', '구분', '금액', '결제방법', '영수증/세금계산서', '비고'].map(safe).join(',')];
  var total = 0, byMethod = {};
  (rows || []).forEach(function (r) {
    total += r.amount;
    var m = r.kind === '환불' ? '(환불)' : (r.method || '(방법 미입력)');
    byMethod[m] = (byMethod[m] || 0) + r.amount;
    out.push([r.date, r.customer, r.staff, r.kind, r.amount, r.method, r.receipt, r.note].map(safe).join(','));
  });
  out.push('');
  out.push([month + ' 합계(입금-환불)', '', '', '', total].map(safe).join(','));
  Object.keys(byMethod).sort().forEach(function (k) { out.push(['  ' + k, '', '', '', byMethod[k]].map(safe).join(',')); });
  return out.join('\n');
}

function exportTaxMonth(month) {
  if (!(typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'master')) { if (typeof showToast === 'function') showToast('세무용 자료는 마스터만 내보낼 수 있어요'); return; }
  var def = new Date(); def.setMonth(def.getMonth() - 1);
  var m = month || prompt('내보낼 달을 입력하세요 (예: 2026-09)', def.getFullYear() + '-' + String(def.getMonth() + 1).padStart(2, '0'));
  if (!m) return;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) { alert('달 형식이 맞지 않아요. 2026-09 처럼 입력해 주세요.'); return; }
  if (typeof showToast === 'function') showToast('최신 데이터 확인 중...');
  loadCustomersAsync(function () {
    try {
      var customers = loadCustomers().filter(function (c) { return !isSoftDeleted(c); });
      var ests = JSON.parse(localStorage.getItem('dah_saved') || '[]');
      var rows = taxBuildMonthRows(customers, ests, m);
      var csv = '﻿' + taxRowsToCsv(rows, m);
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'dah_세무자료_' + m + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
      if (typeof showToast === 'function') showToast(m + ' 입금·환불 ' + rows.length + '건을 내보냈어요');
    } catch (e) { alert('내보내기 실패: ' + e.message); }
  }, true);
}
