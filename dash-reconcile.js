// dash-reconcile.js
// ══════════════════════════════════════════════════
// 2026-10-14(전문업체 점검 - "앱 숫자가 일관돼도 통장에 들어온 돈과 같은지는 확인 못 함"): 입금 대조 도구(마스터 전용, 설정 > 입금 대조).
// 은행·카드사 내역을 엑셀에서 복사해 붙여넣거나 CSV로 올리면, 앱에 기록된 입금(견적서별 선금·잔금, 환불된 입금 포함)과
// 금액·날짜(±N일)·입금자 이름으로 1:1 맞춰 "일치 / 통장에만 있음(기록 누락 의심) / 앱에만 있음(오기·가짜 의심)"을 보여줌.
// - 업로드한 내용은 서버로 보내지 않고 이 화면 안에서만 계산함(저장도 안 함).
// - 읽기 전용 도구: 앱 데이터를 고치지 않음.
// - 카드 정산(수수료 차감·여러 건 합산 입금)은 1:1로 안 맞을 수 있음 → 계좌이체 입금 내역 위주로 사용.
// ══════════════════════════════════════════════════

/**
 * 붙여넣은 텍스트(엑셀 복사=탭 구분, CSV=쉼표/세미콜론)를 표(문자열 배열의 배열)로 바꿈. 따옴표 안의 구분자는 무시.
 * @param {string} text
 * @returns {string[][]}
 */
function reconParseTable(text) {
  var lines = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').filter(function (l) { return l.trim() !== ''; });
  if (!lines.length) return [];
  var sample = lines.slice(0, 5).join('\n');
  var delim = '\t';
  if (sample.indexOf('\t') < 0) {
    var commas = (sample.match(/,/g) || []).length, semis = (sample.match(/;/g) || []).length;
    delim = semis > commas ? ';' : ',';
  }
  return lines.map(function (line) {
    var out = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (inQ) {
        if (ch === '"') { if (line.charAt(i + 1) === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}

/**
 * "1,200,000" "1,200,000원" "₩1200000" "-5,000" "(5,000)" → 숫자. 숫자가 아니면 null.
 * @param {string} s
 * @returns {number|null}
 */
function reconParseAmount(s) {
  var t = String(s == null ? '' : s).trim();
  if (!t) return null;
  var neg = /^\(.*\)$/.test(t) || /^-/.test(t);
  t = t.replace(/[,\s원₩\\()+-]/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  var n = Number(t);
  return neg ? -n : n;
}

/**
 * 2026-10-05 / 2026.10.05 / 2026/10/05 / 20261005 / 26.10.05 (뒤에 시각이 붙어도 됨) → 'YYYY-MM-DD'. 아니면 ''.
 * @param {string} s
 * @returns {string}
 */
function reconParseDate(s) {
  var t = String(s == null ? '' : s).trim();
  var m = t.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/) || t.match(/^(\d{4})(\d{2})(\d{2})(?!\d)/) || t.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/);
  if (!m) return '';
  var y = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
  var mo = Number(m[2]), d = Number(m[3]);
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
}

/**
 * 표에서 머리글 여부와 날짜·금액 열을 자동으로 찾음(틀리면 화면에서 사람이 고름).
 * 은행 내역처럼 입금/출금 열이 따로 있으면 입금 열을 금액으로 씀.
 * @param {string[][]} rows
 * @returns {{hasHeader: boolean, header: string[], dateCol: number, amountCol: number, ncol: number}}
 */
function reconDetectColumns(rows) {
  var ncol = 0;
  rows.forEach(function (r) { if (r.length > ncol) ncol = r.length; });
  var first = rows[0] || [];
  var firstIsData = first.some(function (c) { return reconParseDate(c) !== ''; }) && first.some(function (c) { var a = reconParseAmount(c); return a !== null && Math.abs(a) >= 1000; });
  var hasHeader = !firstIsData;
  var data = hasHeader ? rows.slice(1) : rows;
  var header = hasHeader ? first : [];
  var dateCol = -1, bestDate = 0.5;
  var amtFrac = [];
  for (var c = 0; c < ncol; c++) {
    var dOk = 0, aOk = 0, total = 0;
    data.forEach(function (r) {
      var cell = r[c]; if (cell === undefined || cell === '') return;
      total++;
      if (reconParseDate(cell)) dOk++;
      else { var a = reconParseAmount(cell); if (a !== null) aOk++; }
    });
    var df = total ? dOk / total : 0;
    if (df > bestDate) { bestDate = df; dateCol = c; }
    amtFrac.push(total ? aOk / total : 0);
  }
  var amountCol = -1;
  var cand = [];
  for (var k = 0; k < ncol; k++) if (k !== dateCol && amtFrac[k] >= 0.5) cand.push(k);
  var headName = function (i) { return String(header[i] || ''); };
  var pick = cand.filter(function (i) { return /입금|맡기신|수입|거래금액|승인금액|결제금액|금액/.test(headName(i)) && !/잔액|출금|찾으신|수수료|지급|수납/.test(headName(i)); });
  if (pick.length) amountCol = pick[0];
  else if (cand.length) amountCol = cand[0];
  return { hasHeader: hasHeader, header: header, dateCol: dateCol, amountCol: amountCol, ncol: ncol };
}

/**
 * 표 + 열 지정 → 대조용 은행 행(입금만: 금액 > 0, 날짜 있음). 나머지 열은 입금자·메모 글자로 합침(이름 맞춰보기용).
 * @param {string[][]} rows
 * @param {{hasHeader: boolean, dateCol: number, amountCol: number}} cols
 * @returns {Array<{date: string, amount: number, text: string, line: number}>}
 */
function reconBuildBankRows(rows, cols) {
  var out = [];
  var start = cols.hasHeader ? 1 : 0;
  for (var i = start; i < rows.length; i++) {
    var r = rows[i];
    var date = reconParseDate(r[cols.dateCol]);
    var amt = reconParseAmount(r[cols.amountCol]);
    if (!date || amt === null || amt <= 0) continue;
    // 입금자·메모 글자만 모음(출금액·잔액 같은 숫자 열과 날짜 열은 제외)
    var text = r.filter(function (cell, idx) { return idx !== cols.dateCol && idx !== cols.amountCol && cell !== '' && reconParseAmount(cell) === null && reconParseDate(cell) === ''; }).join(' ');
    out.push({ date: date, amount: amt, text: text, line: i + 1 });
  }
  return out;
}

/**
 * 앱에 기록된 입금 목록 만들기: 고객별 getAllEstPays(견적서별 선금·잔금, 환불 반영 순입금액) + 환불된 입금(환불 전 금액, 통장에는 들어왔던 돈).
 * @param {Array<any>} customers
 * @returns {Array<{customer: string, staff: string, slot: string, amount: number, date: string, note: string}>}
 */
function reconCollectAppPayments(customers) {
  var out = [];
  (customers || []).forEach(function (c) {
    var pays = (typeof getAllEstPays === 'function') ? getAllEstPays(c) : [];
    pays.forEach(function (p) {
      var dep = Number(p.depositAmount) || 0, bal = Number(p.balanceAmount) || 0;
      if (dep > 0 && p.depositDate) out.push({ customer: c.clientName || '', staff: c.staffName || '', slot: '선금', amount: dep, date: String(p.depositDate).slice(0, 10), note: '' });
      if (bal > 0 && p.balanceDate) out.push({ customer: c.clientName || '', staff: c.staffName || '', slot: '잔금', amount: bal, date: String(p.balanceDate).slice(0, 10), note: '' });
      (p.refunds || []).forEach(function (rf) {
        var amt = Number(rf.amount) || 0;
        if (amt > 0 && rf.paidDate) out.push({ customer: c.clientName || '', staff: c.staffName || '', slot: rf.slot === 'balance' ? '잔금' : '선금', amount: amt, date: String(rf.paidDate).slice(0, 10), note: '환불된 입금(' + (rf.refundDate || '') + ' 환불)' });
      });
    });
  });
  return out;
}

/** @param {string} a @param {string} b @returns {number} 일 차이(절댓값) */
function reconDayDiff(a, b) {
  var da = Date.parse(a + 'T00:00:00Z'), db = Date.parse(b + 'T00:00:00Z');
  return Math.abs(Math.round((da - db) / 86400000));
}

/**
 * 은행 입금 ↔ 앱 입금 1:1 맞춤. 같은 금액·날짜 차이 windowDays일 이내. 이름이 통장 글자에 들어 있으면 우선.
 * 앱에만 있는 건은 "통장 내역의 날짜 범위(± windowDays) 안에 있는 것"만 보여줌(범위 밖은 비교 불가).
 * @param {Array<{date: string, amount: number, text: string, line: number}>} bank
 * @param {Array<{customer: string, staff: string, slot: string, amount: number, date: string, note: string}>} app
 * @param {number} windowDays
 */
function reconMatch(bank, app, windowDays) {
  var w = Math.max(0, Number(windowDays) || 0);
  var used = {};
  var matched = [], bankOnly = [];
  var sorted = bank.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  sorted.forEach(function (b) {
    var compact = String(b.text || '').replace(/\s+/g, '');
    var best = -1, bestScore = 1e9;
    for (var i = 0; i < app.length; i++) {
      if (used[i]) continue;
      var a = app[i];
      if (a.amount !== b.amount) continue;
      var dd = reconDayDiff(a.date, b.date);
      if (dd > w) continue;
      var nm = String(a.customer || '').replace(/\s+/g, '');
      var nameHit = nm.length >= 2 && compact.indexOf(nm) >= 0;
      var score = (nameHit ? 0 : 10) + dd;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best >= 0) { used[best] = true; matched.push({ bank: b, app: app[best], dayDiff: reconDayDiff(app[best].date, b.date) }); }
    else bankOnly.push(b);
  });
  var appOnly = [];
  if (sorted.length) {
    var minD = sorted[0].date, maxD = sorted[sorted.length - 1].date;
    app.forEach(function (a, i) {
      if (used[i]) return;
      var lo = reconDayDiff(a.date, minD), hi = reconDayDiff(a.date, maxD);
      var inRange = (a.date >= minD && a.date <= maxD) || lo <= w || hi <= w;
      if (inRange) appOnly.push(a);
    });
  }
  return { matched: matched, bankOnly: bankOnly, appOnly: appOnly };
}

// ───────── 화면 (설정 > 입금 대조, 마스터 전용) ─────────
function _reconWon(n) { return Number(n).toLocaleString() + '원'; }

/**
 * @param {HTMLElement} wrap
 * @param {function(string, string, HTMLElement[], boolean): HTMLElement} makeGroup
 */
function renderSettingsReconcileGroup(wrap, makeGroup) {
  var card = div('padding-top:4px', []);
  card.appendChild(span('font-size:11px;color:var(--sub);display:block;line-height:1.6;margin-bottom:10px',
    '통장(또는 결제 내역)에 실제로 들어온 돈과 앱에 기록된 입금이 맞는지 확인해요. ① 은행/카드사 사이트에서 내역을 엑셀로 열고, 날짜·입금액이 있는 부분을 복사해서 아래 칸에 붙여넣거나 CSV 파일을 올려주세요. ② "대조하기"를 누르면 결과가 나와요. 올린 내용은 서버로 보내지 않고 이 화면에서만 계산해요. ※ 카드 정산(수수료 차감·합산 입금)은 안 맞을 수 있어서 계좌 입금 내역에 쓰는 것이 정확해요.'));
  var ta = el('textarea', { id: 'recon-text', placeholder: '여기에 붙여넣기 (엑셀에서 복사)', style: 'width:100%;height:110px;border:1px solid var(--border);border-radius:10px;padding:8px;font-size:11px;font-family:inherit;box-sizing:border-box' });
  card.appendChild(ta);
  var fileRow = div('display:flex;gap:8px;align-items:center;margin:8px 0', []);
  var fileInput = el('input', { type: 'file', id: 'recon-file', accept: '.csv,.txt,.tsv', style: 'font-size:11px' });
  fileRow.appendChild(fileInput);
  card.appendChild(fileRow);
  var colRow = div('display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;font-size:11px;color:var(--dark)', []);
  var dateSel = el('select', { id: 'recon-date-col', style: 'padding:5px;border:1px solid var(--border);border-radius:8px;font-size:11px' });
  var amtSel = el('select', { id: 'recon-amt-col', style: 'padding:5px;border:1px solid var(--border);border-radius:8px;font-size:11px' });
  var winInput = el('input', { type: 'number', id: 'recon-window', value: '3', min: '0', max: '30', style: 'width:48px;padding:5px;border:1px solid var(--border);border-radius:8px;font-size:11px' });
  colRow.appendChild(span('', '날짜 열'));
  colRow.appendChild(dateSel);
  colRow.appendChild(span('', '입금액 열'));
  colRow.appendChild(amtSel);
  colRow.appendChild(span('', '날짜 허용 오차'));
  colRow.appendChild(winInput);
  colRow.appendChild(span('', '일'));
  card.appendChild(colRow);
  var result = div('margin-top:10px', []);
  result.id = 'recon-result';

  /** @type {string[][]} */
  var rowsCache = [];
  function fillSelects() {
    rowsCache = reconParseTable(ta.value);
    dateSel.innerHTML = ''; amtSel.innerHTML = '';
    if (!rowsCache.length) return;
    var cols = reconDetectColumns(rowsCache);
    for (var i = 0; i < cols.ncol; i++) {
      var label = (cols.hasHeader && cols.header[i]) ? cols.header[i] : ((rowsCache[cols.hasHeader ? 1 : 0] || [])[i] || '') ;
      var name = (i + 1) + '번째 · ' + String(label).slice(0, 14);
      var o1 = el('option', { value: String(i) }); o1.textContent = name; dateSel.appendChild(o1);
      var o2 = el('option', { value: String(i) }); o2.textContent = name; amtSel.appendChild(o2);
    }
    if (cols.dateCol >= 0) dateSel.value = String(cols.dateCol);
    if (cols.amountCol >= 0) amtSel.value = String(cols.amountCol);
  }
  ta.addEventListener('input', fillSelects);
  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var buf = /** @type {ArrayBuffer} */ (reader.result);
      var txt = new TextDecoder('utf-8').decode(buf);
      // 한국 은행 CSV는 EUC-KR인 경우가 많음 → 깨진 글자(�)가 있으면 EUC-KR로 다시 읽음
      if (txt.indexOf('�') >= 0) { try { txt = new TextDecoder('euc-kr').decode(buf); } catch (e) { /* 지원 안 되면 그대로 */ } }
      ta.value = txt;
      fillSelects();
    };
    reader.readAsArrayBuffer(f);
  });

  function run() {
    result.innerHTML = '';
    if (!rowsCache.length) rowsCache = reconParseTable(ta.value);
    if (!rowsCache.length) { result.appendChild(span('font-size:12px;color:#B3261E', '붙여넣은 내용이 없어요.')); return; }
    var det = reconDetectColumns(rowsCache);
    var cols = { hasHeader: det.hasHeader, dateCol: Number(dateSel.value), amountCol: Number(amtSel.value) };
    if (isNaN(cols.dateCol) || isNaN(cols.amountCol) || dateSel.value === '' || amtSel.value === '') { result.appendChild(span('font-size:12px;color:#B3261E', '날짜 열과 입금액 열을 찾지 못했어요. 위에서 직접 골라주세요.')); return; }
    var bank = reconBuildBankRows(rowsCache, cols);
    if (!bank.length) { result.appendChild(span('font-size:12px;color:#B3261E', '입금 내역(날짜와 0보다 큰 금액)을 찾지 못했어요. 열 선택을 확인해주세요.')); return; }
    var go = function (customers) {
      var app = reconCollectAppPayments(customers);
      var res = reconMatch(bank, app, Number(winInput.value) || 0);
      renderReconResult(result, bank, app, res);
    };
    result.appendChild(span('font-size:12px;color:var(--sub)', '최신 데이터를 불러오는 중…'));
    var loadC = (typeof loadCustomersAsync === 'function') ? loadCustomersAsync : null;
    var loadE = (typeof loadEstimatesAsync === 'function') ? loadEstimatesAsync : null;
    var finish = function () { go(loadCustomers()); };
    if (loadE && loadC) { loadE(function () { loadC(function () { finish(); }, true); }, true); }
    else finish();
  }
  card.appendChild(btn('width:100%;padding:11px;background:var(--dark);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer', '대조하기', run));
  card.appendChild(result);
  wrap.appendChild(makeGroup('sec-set-reconcile', '입금 대조 (통장 ↔ 앱)', [card], false));
}

/**
 * @param {HTMLElement} box
 * @param {Array<any>} bank
 * @param {Array<any>} app
 * @param {{matched: Array<any>, bankOnly: Array<any>, appOnly: Array<any>}} res
 */
function renderReconResult(box, bank, app, res) {
  box.innerHTML = '';
  var sumB = res.bankOnly.reduce(function (s, b) { return s + b.amount; }, 0);
  var sumA = res.appOnly.reduce(function (s, a) { return s + a.amount; }, 0);
  var head = '<div style="font-size:12px;line-height:1.7;color:var(--dark);margin-bottom:10px">' +
    '통장 입금 <b>' + bank.length + '건</b> 중 <b style="color:#2E7D32">' + res.matched.length + '건 일치</b> · ' +
    '<b style="color:' + (res.bankOnly.length ? '#B3261E' : '#2E7D32') + '">통장에만 있음 ' + res.bankOnly.length + '건(' + _reconWon(sumB) + ')</b> · ' +
    '<b style="color:' + (res.appOnly.length ? '#B3261E' : '#2E7D32') + '">앱에만 있음 ' + res.appOnly.length + '건(' + _reconWon(sumA) + ')</b>' +
    '</div>';
  var html = head;
  var table = function (title, hint, rows, cols) {
    if (!rows.length) return '';
    var t = '<div style="font-size:12px;font-weight:700;color:var(--dark);margin:12px 0 2px">' + title + '</div><div style="font-size:11px;color:var(--sub);margin-bottom:6px">' + hint + '</div>' +
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><tr>' +
      cols.map(function (c) { return '<th style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--border);color:var(--sub);font-weight:600;white-space:nowrap">' + c + '</th>'; }).join('') + '</tr>';
    rows.forEach(function (r) { t += '<tr>' + r.map(function (c) { return '<td style="padding:4px 6px;border-bottom:1px solid #F5F2EE;white-space:nowrap">' + c + '</td>'; }).join('') + '</tr>'; });
    return t + '</table></div>';
  };
  html += table('⚠️ 통장에만 있음', '통장에 돈이 들어왔는데 앱에 같은 금액·날짜의 입금 기록이 없어요. 기록 누락이거나, 카드 정산·다른 용도의 입금일 수 있어요.',
    res.bankOnly.map(function (b) { return [escHtml(b.date), _reconWon(b.amount), escHtml(String(b.text).slice(0, 40)), b.line + '행']; }), ['날짜', '금액', '통장 내용', '위치']);
  html += table('⚠️ 앱에만 있음', '앱에는 입금으로 기록됐는데 통장 내역(같은 기간)에서 같은 금액을 찾지 못했어요. 입력 오류·날짜 오류이거나 카드/현금 결제일 수 있어요.',
    res.appOnly.map(function (a) { return [escHtml(a.date), _reconWon(a.amount), escHtml(a.customer) + (a.staff ? ' <span style="color:var(--sub)">(' + escHtml(a.staff) + ')</span>' : ''), escHtml(a.slot) + (a.note ? ' · ' + escHtml(a.note) : '')]; }), ['날짜', '금액', '고객', '구분']);
  html += table('✅ 일치', '금액이 같고 날짜가 허용 오차 안이에요.',
    res.matched.map(function (m) { return [escHtml(m.bank.date), _reconWon(m.bank.amount), escHtml(m.app.customer), escHtml(m.app.slot) + (m.dayDiff ? ' · 날짜 ' + m.dayDiff + '일 차이' : '')]; }), ['날짜', '금액', '고객', '구분']);
  box.innerHTML = html;
}
