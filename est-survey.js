/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 설문지 연동
   구글시트/Supabase에서 고객 사전설문 데이터 불러오기,
   불러온 설문 내용 화면에 표시.
   ══════════════════════════════════════════════════ */

var SURVEY_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby-MQSYO69RvaLNdQ8KjZLWVE7Nqp43SBzvAegRxgtAq3DrPn_vAXvppDRMkobP04AwTQ/exec';

function loadSurveyFromSheet() {
  var nameVal = document.getElementById('c-name').value.trim();
  var btn = document.getElementById('btn-load-survey');
  if(btn) btn.textContent = '⏳ 불러오는 중...';

  function fromSheet() {
    var url = SURVEY_SCRIPT_URL;
    if(nameVal) url += '?name=' + encodeURIComponent(nameVal);
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = function() {
      if(btn) btn.textContent = '📋 설문 불러오기';
      try {
        var data = JSON.parse(xhr.responseText);
        if(data.result === 'success') {
          applySurveyData(data);
          showToast('✅ 설문 데이터를 불러왔습니다 (구글시트)');
        } else if(data.result === 'notfound') {
          showToast('⚠️ 해당 고객 설문이 없습니다');
        } else if(data.result === 'empty') {
          showToast('⚠️ 설문 데이터가 없습니다');
        } else {
          showToast('⚠️ 불러오기 실패');
        }
      } catch(e) {
        showToast('⚠️ 불러오기 실패');
      }
    };
    xhr.onerror = function() {
      if(btn) btn.textContent = '📋 설문 불러오기';
      showToast('⚠️ 네트워크 오류');
    };
    xhr.send();
  }

  function applySurveyData(data) {
    if(data.name && !document.getElementById('c-name').value) {
      document.getElementById('c-name').value = data.name;
    }
    if(data.phone && !document.getElementById('c-phone').value) {
      document.getElementById('c-phone').value = data.phone;
    }
    if(data.addr && !document.getElementById('c-addr').value) {
      document.getElementById('c-addr').value = data.addr;
    }
    displaySurvey(data);
  }

  if(!nameVal) { showToast('⚠️ 먼저 고객 이름을 입력해주세요'); if(btn) btn.textContent = '📋 설문 불러오기'; return; }

  // 1순위: Supabase surveys 테이블에서 이름으로 최신 1건 조회
  var sxhr = new XMLHttpRequest();
  var sUrl = SUPABASE_URL + '/rest/v1/surveys?client_name=eq.' + encodeURIComponent(nameVal) + '&order=created_at.desc&limit=1';
  sxhr.open('GET', sUrl, true);
  sxhr.setRequestHeader('apikey', SUPABASE_KEY);
  sxhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
  sxhr.onload = function() {
    try {
      var rows = JSON.parse(sxhr.responseText);
      if(Array.isArray(rows) && rows.length > 0) {
        var r = rows[0];
        var a = r.answers || {};
        if(btn) btn.textContent = '📋 설문 불러오기';
        applySurveyData({
          name: r.client_name, phone: r.phone, addr: r.addr,
          spaces: r.space ? r.space.split(',').map(function(s){return s.trim();}).filter(Boolean) : [],
          pyeong: a.pyeong,
          homeDir: a.homeDir, wallTone: a.wallTone, floorType: a.floorType,
          moods: a.moods || [], functions: a.functions || [],
          budget: a.budget, memo: r.memo
        });
        showToast('✅ 설문 데이터를 불러왔습니다 (Supabase)');
      } else {
        // Supabase에 없으면 구글시트로 폴백 (surveys 테이블 생성 전 또는 이전 데이터)
        fromSheet();
      }
    } catch(e) {
      fromSheet();
    }
  };
  sxhr.onerror = function() {
    // Supabase 조회 실패 시에도 구글시트로 폴백
    fromSheet();
  };
  sxhr.send();
}

function displaySurvey(s) {
  var dataEl=document.getElementById('survey-data');
  var card=document.getElementById('survey-card');
  if(!dataEl) return;
  var fields=[
    {label:'공간',val:s.spaces&&s.spaces.length?s.spaces.join(', '):null},
    {label:'평수',val:s.pyeong||null},
    {label:'방향',val:s.homeDir||null},
    {label:'벽지 톤',val:s.wallTone||null},
    {label:'바닥재',val:s.floorType||null},
    {label:'분위기',val:s.moods&&s.moods.length?s.moods.join(', '):null},
    {label:'기능',val:s.functions&&s.functions.length?s.functions.join(', '):null},
    {label:'예산',val:s.budget||null},
    {label:'메모',val:s.memo||null},
  ].filter(function(f){return f.val;});
  if(!fields.length) return;
  dataEl.innerHTML='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">'+
    fields.map(function(f){
      return '<div style="padding:10px 14px;background:#FAF7F5;border:1px solid #EEE6DC">'+
        '<div style="font-size:11px;font-weight:700;color:#B0A99F;letter-spacing:0.8px;margin-bottom:var(--sp-1)">'+f.label+'</div>'+
        '<div style="font-size:11px;font-weight:500">'+f.val+'</div></div>';
    }).join('')+'</div>';
  if(card) card.style.display='block';
}
