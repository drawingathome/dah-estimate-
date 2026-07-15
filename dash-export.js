/* ══════════════════════════════════════════════════
   DAH 대시보드 — 백업 / 엑셀 내보내기 기능
   고객 데이터 JSON 백업, 고객목록/견적서목록 CSV 내보내기.
   (doBackup과 backupData는 기능이 겹치는 것으로 보임 — 추후 정리 후보)
   ══════════════════════════════════════════════════ */

function doBackup() {
  try {
    var customers = loadCustomers();
    var data = {
      customers:  customers,
      exportedAt: new Date().toISOString(),
      version:    '1.0',
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'DAH_백업_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    
    // 마지막 백업 시간 저장
    localStorage.setItem('dah_last_backup', new Date().toISOString());
    var el = document.getElementById('last-backup');
    if (el) el.textContent = '마지막 백업: 방금 전';
    showToast('백업 파일이 다운로드됩니다');
  } catch(e) {
    showToast('백업 실패: ' + e.message);
  }
}

function backupData() {
  try { var data = {customers: loadCustomers(), exported: new Date().toISOString(), version: '1.0'}; var json = JSON.stringify(data, null, 2); var blob = new Blob([json], {type: 'application/json'}); var url = URL.createObjectURL(blob); var a = document.createElement('a'); var d = new Date(); a.href = url; a.download = 'dah_backup_' + d.getFullYear() + pad2(d.getMonth()+1) + pad2(d.getDate()) + '.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  try { localStorage.setItem('dah_last_backup', new Date().toISOString()); } catch(e2){}
  var lb = document.getElementById('last-backup-time'); if(lb) lb.textContent = '마지막 백업: 방금 전';
  showToast('백업 파일이 저장됐습니다'); } catch(e) { alert('백업 실패: ' + e.message); }
}

function exportExcel() {
  try {
    var customers = loadCustomers().filter(function(c){ return !isSoftDeleted(c); });
    if (!customers || customers.length === 0) { showToast('내보낼 고객 데이터가 없습니다'); return; }

    var headers = ['고객명','연락처','주소','공간','단계','금액','성과매출','담당자','계약일','실측일','시공일','방문횟수','메모'];

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
        c.visitCount   || 1,
        c.memo         || ''
      ];
    });

    var BOM = '\uFEFF';
    var csv = BOM + [headers].concat(rows).map(function(row) {
      return row.map(function(cell) {
        var s = String(cell);
        if (s.indexOf(',') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('"') >= 0) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(',');
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
  try {
    var estimates = [];
    try { estimates = JSON.parse(localStorage.getItem('dah_saved') || '[]'); } catch(ex) {}

    if (!estimates || estimates.length === 0) { showToast('내보낼 견적서 데이터가 없습니다'); return; }

    var CONTRACT_KO = {pending:'가견적', contracted:'계약됨', rejected:'미계약'};
    var STATUS_KO   = {ga:'가견적서', final:'최종견적서'};

    var headers = [
      '견적번호','구분','계약상태','고객명','공간',
      '제품','원단','너비(cm)','높이(cm)',
      '금액(원)','담당자','견적일','저장일','메모'
    ];

    var rows = estimates.map(function(e) {
      return [
        e.no             || '',
        STATUS_KO[e.status] || '가견적서',
        CONTRACT_KO[e.contractStatus] || '가견적',
        e.clientName     || '',
        e.space          || '',
        e.product        || '',
        e.fabric         || '',
        e.width          || '',
        e.height         || '',
        Number(e.price)  || 0,
        e.staffName      || '마스터',
        e.date           || '',
        e.savedAt ? e.savedAt.slice(0,10) : '',
        e.memo           || ''
      ];
    });

    var BOM = '\uFEFF';
    var csv = BOM + [headers].concat(rows).map(function(row) {
      return row.map(function(cell) {
        var s = String(cell);
        if (s.indexOf(',') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('"') >= 0) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(',');
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
