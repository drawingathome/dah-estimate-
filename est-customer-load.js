/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — PDF모달 / 고객불러오기 / 계약금계산
   PDF 사이즈 선택, 기존 고객목록에서 불러오기/검색,
   계약금(선금) 자동/수동 계산.
   ══════════════════════════════════════════════════ */

var _selectedPdfOpt = 'fit';

function openPdfModal() {
  _selectedPdfOpt = 'fit';
  document.getElementById('pdf-opt-fit')?.classList.add('selected');
  document.getElementById('pdf-opt-a4')?.classList.remove('selected');
  document.getElementById('pdf-size-modal')?.classList.add('open');
}
function closePdfModal() {
  document.getElementById('pdf-size-modal')?.classList.remove('open');
}
function selectPdfOpt(type) {
  _selectedPdfOpt = type;
  document.getElementById('pdf-opt-fit')?.classList.toggle('selected', type==='fit');
  document.getElementById('pdf-opt-a4')?.classList.toggle('selected', type==='a4');
}
function confirmPdfPrint() {
  closePdfModal();
  var styleId = 'pdf-page-style';
  var old = document.getElementById(styleId);
  if(old) old.remove();
  var s = document.createElement('style');
  s.id = styleId;
  if(_selectedPdfOpt === 'fit') {
    // "size: auto"는 사용자가 인쇄창에서 선택한 용지 크기를 그대로 따르는 것일 뿐,
    // 콘텐츠 길이에 맞춰 페이지가 늘어나는 게 아니라서 실제로는 효과가 없었음(선혜님 발견).
    // 실제 콘텐츠(.pv-wrap)의 렌더링된 높이를 측정해서, 그 길이에 정확히 맞는 커스텀
    // 페이지 크기(폭 210mm 고정, 높이는 콘텐츠+여백)를 지정해야 한 페이지로 통으로 인쇄됨.
    var contentEl = document.querySelector('#pv-overlay .pv-wrap') || document.querySelector('.pv-wrap');
    var heightPx = contentEl ? contentEl.scrollHeight : 1123; // 못 구하면 A4 세로 기본값(약 297mm)으로 폴백
    var PX_TO_MM = 25.4 / 96; // 웹 표준 96dpi 기준 px→mm 환산
    var marginMm = 20; // 위아래 여백 10mm씩
    var heightMm = Math.ceil(heightPx * PX_TO_MM) + marginMm;
    s.textContent = '@media print { @page { size: 210mm ' + heightMm + 'mm; margin: 10mm 12mm; } .pv-wrap { page-break-inside: avoid; } }';
  } else {
    
    s.textContent = '@media print { @page { size: A4 portrait; margin: 10mm 12mm; } }';
  }
  document.head.appendChild(s);
  setTimeout(function(){ window.print(); }, 100);
}

function openCustomerLoad() {
  var ov = document.getElementById('cust-load-overlay');
  if(!ov) return;
  ov.classList.add('open');
  document.getElementById('cust-load-query').value = '';
  renderCustLoadList('');
  document.getElementById('cust-load-query').focus();
}
function closeCustLoad() {
  var ov = document.getElementById('cust-load-overlay');
  if(ov) ov.classList.remove('open');
}
function renderCustLoadList(q) {
  var list = document.getElementById('cust-load-list');
  if(!list) return;
  var customers = [];
  try { customers = JSON.parse(localStorage.getItem('dah_customers')||'[]'); } catch(e){}
  var filtered = q ? customers.filter(function(c){
    return (c.clientName||'').includes(q) || (c.phone||'').replace(/-/g,'').includes(q.replace(/-/g,''));
  }) : customers;
  
  filtered.sort(function(a,b){ return (b.createdAt||b.date||'') > (a.createdAt||a.date||'') ? 1 : -1; });
  if(!filtered.length) {
    list.innerHTML = '<div class="cust-load-empty">'+( q ? '검색 결과 없음' : '저장된 고객이 없습니다<br><span style="font-size:11px;color:#B0A99F">견적서 저장 시 자동으로 등록됩니다</span>')+'</div>';
    return;
  }
  
  var savedAll = [];
  try { savedAll = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e){}

  var displayList = q ? filtered.slice(0,100) : filtered.slice(0,30);
  list.innerHTML = displayList.map(function(c) {
    var info = [c.phone, c.addr].filter(Boolean).join(' · ');
    var lastEst = c.lastAmt ? c.lastAmt.toLocaleString()+'원 ('+c.lastDate+')' : '';
    var idx = customers.indexOf(c);
    
    var history = c.id
      ? savedAll.filter(function(s){ return s.clientId === c.id; }).slice(0,3)
      : savedAll.filter(function(s){ return s.clientName === (c.clientName||''); }).slice(0,3);
    var histHtml = history.length > 0
      ? '<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">'
        + history.map(function(h){
            var lbl = h.status==='final'?'최종':'가견적';
            var amt = h.price ? h.price.toLocaleString()+'원' : '';
            return '<span style="font-size:11px;background:#F5F2EE;color:#8E8078;padding:2px 6px;border-radius:4px">'+lbl+(amt?' · '+amt:'')+'</span>';
          }).join('')
        + '</div>'
      : '';
    return '<div class="cust-load-item" data-idx="'+idx+'" onclick="loadCustByIdx(this)">'
      +'<div class="cust-load-name">'+escHtml(c.clientName||'이름없음')+'</div>'
      +'<div class="cust-load-info">'+escHtml(info)+(lastEst?' &nbsp;|&nbsp; 최근: '+escHtml(lastEst):'')+'</div>'
      +histHtml
      +'</div>';
  }).join('');
}
function filterCustLoad() {
  renderCustLoadList(document.getElementById('cust-load-query')?.value||'');
}
function loadCustByIdx(el) {
  var idx = parseInt(el.getAttribute('data-idx'));
  var customers = [];
  try { customers = JSON.parse(localStorage.getItem('dah_customers')||'[]'); } catch(e){}
  var c = customers[idx];
  if(!c) return;
  if(c.clientName && document.getElementById('c-name')) document.getElementById('c-name').value=c.clientName;
  if(c.phone && document.getElementById('c-phone')) document.getElementById('c-phone').value=c.phone;
  if(c.addr && document.getElementById('c-addr')) document.getElementById('c-addr').value=c.addr;
  closeCustLoad();
  showToast('고객 정보를 불러왔습니다 — '+(c.clientName||''));
}

function searchCustomer() {
  var ov = document.getElementById('customer-search-overlay');
  if(ov) { ov.style.display='flex'; return; }
  var el = document.createElement('div');
  el.id='customer-search-overlay';
  el.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:center;justify-content:center';
  var inner=document.createElement('div');
  inner.style.cssText='background:#fff;border-radius:12px;padding:24px;width:480px;max-width:90vw';
  inner.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><span style="font-size:11px;font-weight:700">고객 검색</span><span id="cs-close" style="cursor:pointer;font-size:11px">&#x2715;</span></div><div style="display:flex;gap:8px;margin-bottom:12px"><input type="text" id="cs-query" placeholder="이름 또는 전화번호" style="flex:1;padding:9px 12px;border:1.5px solid #EEE6DC;border-radius:8px;font-size:11px;font-family:inherit;outline:none"><button id="cs-btn" style="padding:8px 16px;background:#282828;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">검색</button></div><div id="cs-results" style="color:#8E8078;font-size:11px;text-align:center;padding:20px">Supabase 연동 후 사용 가능합니다.</div>';
  el.appendChild(inner);
  document.body.appendChild(el);
  document.getElementById('cs-close').onclick=function(){el.style.display='none';};
  document.getElementById('cs-btn').onclick=function(){
    var res=document.getElementById('cs-results');
    if(res) res.innerHTML='<p>검색 기능 준비 중...</p>';
  };
}
function selectCustomer(name,phone,addr){
  if(name) document.getElementById('c-name').value=name;
  if(phone) document.getElementById('c-phone').value=phone;
  if(addr) document.getElementById('c-addr').value=addr;
  var ov=document.getElementById('customer-search-overlay');
  if(ov) ov.style.display='none';
}
function closeCustomerSearch(){
  var ov=document.getElementById('customer-search-overlay');
  if(ov) ov.style.display='none';
}

function calcDeposit() {
  var depInp = document.getElementById('deposit-input');
  if(depInp) depInp.dataset.manualEdit = '1';
  var totalEl = document.getElementById('sum-total');
  var grand = parseInt((totalEl?.textContent||'0').replace(/[^0-9]/g,''))||0;
  var dep = getPriceVal(depInp)||0;
  var bal = grand - dep;
  var balEl = document.getElementById('sum-balance');
  if(balEl) balEl.textContent = bal.toLocaleString()+'원';
}
function setDepositAuto(pct) {
  var totalEl = document.getElementById('sum-total');
  var grand = parseInt((totalEl?.textContent||'0').replace(/[^0-9]/g,''))||0;
  if(!grand) { calcTotal(); grand = parseInt((totalEl?.textContent||'0').replace(/[^0-9]/g,''))||0; }
  var dep = Math.round(grand * pct / 100);
  var depInp = document.getElementById('deposit-input');
  if(depInp){ depInp.setAttribute('data-raw',String(dep)); depInp.value=dep.toLocaleString(); }
  calcDeposit();
}
