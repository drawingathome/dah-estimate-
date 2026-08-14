/* ══════════════════════════════════════════════════
   DAH 대시보드 — 백업 / 엑셀 내보내기 기능
   고객 데이터 JSON 백업, 고객목록/견적서목록 CSV 내보내기.
   (doBackup과 backupData는 기능이 겹치는 것으로 보임 — 추후 정리 후보)
   ══════════════════════════════════════════════════ */

// 2026-08-05: 여기 있던 doBackup()은 어디서도 호출되지 않는 죽은 코드였음(감사 중 발견, 제거함).
// 설정탭의 "백업 (JSON 다운로드)" 버튼은 실제로 backupData()에 연결되어 있음 — 그게 정본.

/* ── CSV 수식 인젝션 방어 (2026-08-05 신규) ──
   셀 값이 =, +, -, @ 로 시작하면 엑셀/구글시트가 수식으로 해석할 수 있음.
   고객명·메모는 사람이 자유롭게 입력하는 텍스트라, 실수로(혹은 악의적으로)
   그런 문자로 시작하는 값이 들어갈 가능성을 원천 차단 — 앞에 작은따옴표를
   붙여 "이건 텍스트"라고 명시(엑셀에서 열면 따옴표는 안 보이고 텍스트로만 표시됨). */
function csvSafeCell(cell) {
  var s = String(cell);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (s.indexOf(',') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('"') >= 0) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function backupData() {
  try { var data = {customers: loadCustomers(), exported: new Date().toISOString(), version: '1.0'}; var json = JSON.stringify(data, null, 2); var blob = new Blob([json], {type: 'application/json'}); var url = URL.createObjectURL(blob); var a = document.createElement('a'); var d = new Date(); a.href = url; a.download = 'dah_backup_' + d.getFullYear() + pad2(d.getMonth()+1) + pad2(d.getDate()) + '.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  try { localStorage.setItem('dah_last_backup', new Date().toISOString()); } catch(e2){}
  var lb = document.getElementById('last-backup-time'); if(lb) lb.textContent = '마지막 백업: 방금 전';
  showToast('백업 파일이 저장됐습니다'); } catch(e) { alert('백업 실패: ' + e.message); }
}

function exportExcel() {
  // 2026-08-14: 마스터 전용 - 버튼 숨김만으론 코드 직접호출로 우회 가능하므로 함수에서도 방어
  if (!(typeof currentUser !== "undefined" && currentUser && currentUser.role === "master")) { if (typeof showToast === "function") showToast("엑셀 다운로드는 마스터만 가능해요"); return; }
  try {
    var customers = loadCustomers().filter(function(c){ return !isSoftDeleted(c); });
    if (!customers || customers.length === 0) { showToast('내보낼 고객 데이터가 없습니다'); return; }

    var headers = ['고객명','연락처','주소','공간','단계','금액','성과매출','담당자','계약일','실측일','시공일','확정일','선금액','선금일','잔금액','잔금일','방문횟수','대기리드','발주현황','메모'];

    var ORDER_KEYS = ['fabric','production','blind','material','install'];
    function orderStatusSummary(c) {
      var os = c.orderStatus || {};
      var done = ORDER_KEYS.filter(function(k){ return !!os[k]; }).length;
      if (done === 0) return '';
      return done + '/' + ORDER_KEYS.length + (done === ORDER_KEYS.length ? ' (완료)' : '');
    }

    var rows = customers.map(function(c) {
      return [
        c.clientName   || '',
        c.phone        || '',
        c.addr         || '',
        c.space        || '',
        c.stage        || '',
        c.price        || 0,
        c.performanceRevenue || 0,
        c.staffName    || '마스터',
        c.date         || '',
        c.measureDate  || '',
        c.installDate  || '',
        c.confirmDate  || '',
        c.depositAmount || 0,
        c.depositDate  || '',
        c.balanceAmount || 0,
        c.balanceDate  || '',
        c.visitCount   || 1,
        c.leadParked ? 'Y' : '',
        orderStatusSummary(c),
        c.memo         || ''
      ];
    });

    var BOM = '\uFEFF';
    var csv = BOM + [headers].concat(rows).map(function(row) {
      return row.map(csvSafeCell).join(',');
    }).join('\r\n');

    var blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    var d    = new Date();
    a.href     = url;
    a.download = '드로잉엣홈_고객목록_' + d.getFullYear() + pad2(d.getMonth()+1) + pad2(d.getDate()) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('엑셀 파일 저장 완료 (' + customers.length + '건)');
  } catch(e) {
    alert('내보내기 실패: ' + e.message);
  }
}

function exportEstimatesExcel() {
  // 2026-08-14: 마스터 전용 - 버튼 숨김만으론 코드 직접호출로 우회 가능하므로 함수에서도 방어
  if (!(typeof currentUser !== "undefined" && currentUser && currentUser.role === "master")) { if (typeof showToast === "function") showToast("엑셀 다운로드는 마스터만 가능해요"); return; }
  try {
    var estimates = [];
    try { estimates = JSON.parse(localStorage.getItem('dah_saved') || '[]'); } catch(ex) {}

    if (!estimates || estimates.length === 0) { showToast('내보낼 견적서 데이터가 없습니다'); return; }

    var CONTRACT_KO = {pending:'가견적', contracted:'계약됨', rejected:'미계약'};
    var STATUS_KO   = {ga:'가견적서', final:'최종견적서'};

    var headers = [
      '견적번호','구분','계약상태','고객명','공간',
      '제품','품목수',
      '금액(원)','원단거래처','블라인드거래처','담당자','견적일','저장일','메모'
    ];

    var rows = estimates.map(function(e) {
      return [
        e.no             || '',
        STATUS_KO[e.status] || '가견적서',
        CONTRACT_KO[e.contractStatus] || '가견적',
        e.clientName     || '',
        e.space          || '',
        e.fabric         || '',
        e.itemCount      || '',
        Number(e.price)  || 0,
        (e.curtainVendors || []).join(', '),
        (e.blindVendors || []).join(', '),
        e.staffName      || '마스터',
        e.date           || '',
        e.savedAt ? e.savedAt.slice(0,10) : '',
        e.memo           || ''
      ];
    });

    var BOM = '\uFEFF';
    var csv = BOM + [headers].concat(rows).map(function(row) {
      return row.map(csvSafeCell).join(',');
    }).join('\r\n');

    var blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    var d    = new Date();
    a.href     = url;
    a.download = '드로잉엣홈_견적서목록_' + d.getFullYear() + pad2(d.getMonth()+1) + pad2(d.getDate()) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('견적서 엑셀 저장 완료 (' + estimates.length + '건)');
  } catch(e) {
    alert('내보내기 실패: ' + e.message);
  }
}
