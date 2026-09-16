/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 실측/시공 의뢰서 문서 생성
   (buildRequestHTML, printRequest, openInstallerInfoModal,
    _showRequestPreview)
   2026-09-16: est-documents.js에서 분리됨(위 est-doc-customer.js
   상단 설명 참고).
   ══════════════════════════════════════════════════ */

function buildRequestHTML(kind, extraNote) {
  // kind: 'measure' (실측 의뢰서) or 'install' (시공 의뢰서)
  function infoRow(label, val) {
    return '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px">'
        +'<span style="color:#8E8078">'+label+'</span>'
        +'<strong style="color:#282828;text-align:right">'+(val||'—')+'</strong>'
        +'</div>';
  }

  var cName    = escHtml(document.getElementById('c-name')?.value||'');
  var cPhone   = escHtml(document.getElementById('c-phone')?.value||'');
  var cAddr    = escHtml(document.getElementById('c-addr')?.value||'');
  // 2026-09-15(선혜님 - "실측이나 시공요청서에 주소 뒷부분이 안나오는데?"):
  // 오늘 주소/상세주소를 두 칸으로 분리했는데(splitAddrDetail), 정작 이
  // 실측/시공 의뢰서는 예전부터 계속 c-addr(기본주소)만 읽고 있어서
  // 상세주소(동/호수)가 원래도 안 나가고 있었음 - 그동안은 "비고"란에
  // 직접 타이핑해서 수동으로 우회하고 계셨던 것으로 보임. 실측/시공
  // 담당자가 정확한 호수를 찾아가야 하는 문서라 빠지면 안 되는 정보라,
  // 상세주소가 있으면 주소 뒤에 자동으로 합쳐서 보여줌.
  var cAddrDetail = (document.getElementById('c-addr2')?.value||'').trim();
  if (cAddrDetail) cAddr = (cAddr ? cAddr+' ' : '') + escHtml(cAddrDetail);
  var cStaff   = escHtml(document.getElementById('c-staff')?.value||'장선혜');
  var instName = escHtml(document.getElementById('c-installer-name')?.value||'');
  var instPhone= escHtml(document.getElementById('c-installer-phone')?.value||'');
  var dateVal  = document.getElementById(kind==='measure' ? 'c-measure' : 'c-install')?.value || '';
  var label = kind==='measure' ? '실측' : '시공';

  var out = '<div class="pv-wrap" style="max-width:720px;margin:0 auto;background:#fff;padding:36px 32px">';

  // 상단 로고/타이틀
  out += '<div style="text-align:center;margin-bottom:6px">'
      +'<img class="pv-logo" style="height:36px;display:block;object-fit:contain;margin:0 auto" src="'+DAH_LOGO_B64+'" alt="드로잉엣홈">'
      +'<div style="font-size:11px;color:#B0A99F;letter-spacing:3px;margin-top:6px">'+label+' 의 뢰 서</div>'
      +'</div>';

  // 좌: 업체정보(설치기사) / 우: 고객·일정 정보
  out += '<div style="display:flex;gap:var(--sp-6);margin-top:var(--sp-6);padding-top:16px;border-top:1px solid #282828;font-size:13px">'
      +'<div style="flex:1">'
        +infoRow('업체정보', instName)
        +infoRow('연락처', instPhone)
      +'</div>'
      +'<div style="flex:1">'
        +infoRow(label+'일', dateVal||'미정')
        +infoRow('고객명', cName)
        +infoRow('연락처', cPhone)
        +infoRow('주소', cAddr)
        +infoRow('담당자', cStaff)
      +'</div>'
      +'</div>';

  out += '<div style="margin-top:10px;font-size:11px;color:#B0A99F">*아래와 같이 '+label+'요청 합니다.</div>';
  out += '<div style="margin-top:14px;padding:8px 0;background:#F5F2EE;text-align:center;font-size:12px;font-weight:700;color:#282828">내 용</div>';

  if(kind === 'measure') {
    // ── 실측 의뢰서: 공간별 번호 목록 ──
    // 2026-08-24(선혜님 지적 — "겉지/속지, 연창 관계가 안 보여서 시공팀이
    // 헷갈릴 수 있다"): 예전엔 커튼/블라인드 항목 개수만큼 "공간 : 커튼 1조"를
    // 그대로 반복 출력해서, 같은 공간에 겉지+속지 2줄이 있어도 서로 무관한
    // 별개 항목처럼 보였음. 같은 공간(커튼은 공간 단위, 블라인드는 공간+종류
    // 단위)으로 묶어서 개수만 표시하도록 변경 — "거실 : 커튼 2조",
    // "거실 : 롤스크린 2피스"처럼 한 줄로 정리됨.
    // 2026-08-28(선혜님 요청 — "블라인드 실측 다 누락되었어", "거실[메인] :
    // 겉커튼+속커튼 / 거실[알파룸] : 겉커튼+속커튼 / 거실[측면] : 블라인드
    // 2피스... 이런식으로 만들게 구조를 짜줄 수 있어?"): 예전엔 공간
    // 단위로만 묶어서 "거실 : 커튼 4조"처럼 뭉뚱그려져, 같은 거실 안에
    // [메인]/[알파룸]처럼 서로 다른 창문 위치가 있어도 구분이 안 되고
    // 겉커튼/속커튼 구성도 안 보여서 시공팀이 헷갈릴 수 있었음(제품명이
    // "[메인] 이븐 아이보리 겉커튼"처럼 대괄호 세부위치를 담고 있는 걸
    // 활용해서 재설계). 공간+세부위치로 묶고, 그 안의 겉커튼/속커튼
    // 구성을 함께 표시.
    function extractSubLoc(name) {
      var m = (name||'').match(/^\[([^\]]+)\]/);
      return m ? m[1] : '';
    }
    function curtainRole(name) {
      if (/속커튼/.test(name)) return '속커튼';
      if (/겉커튼/.test(name)) return '겉커튼';
      return '커튼';
    }
    // 2026-08-31(선혜님 지적 — "속커튼+블라인드 일 수도 있는데 이런 것들이
    // 구현되지 않아"): 커튼/블라인드를 각각 별개 딕셔너리(curtainGroups/
    // blindGroups)로 묶어서, 같은 공간+세부위치에 커튼(예: 속커튼만)과
    // 블라인드가 함께 있어도 "거실[정면] : 속커튼 1장"과 "거실[정면] :
    // 롤스크린" 두 줄로 따로 나오고 있었음 — 실제로는 같은 창문 하나에
    // 대한 시공 지시라 한 줄("거실[정면] : 속커튼+롤스크린")로 합쳐서
    // 보여줘야 시공팀이 헷갈리지 않음. 공간+세부위치 기준 하나의 통합
    // 그룹으로 재설계 - 커튼 구성요소(겉커튼/속커튼/커튼)와 블라인드
    // 종류를 같은 그룹 안의 "구성요소" 목록으로 합쳐서 담음.
    var groups = {}; var groupOrder = [];
    function getGroup(space, subLoc) {
      var key = (space||'—')+'|'+subLoc;
      if(!(key in groups)) { groups[key] = { space: space||'—', subLoc: subLoc, parts: {} }; groupOrder.push(key); }
      return groups[key];
    }
    document.querySelectorAll('#curtain-body tr').forEach(function(tr){
      var space  = tr.querySelector('.space-inp')?.value || '';
      var fabric = tr.querySelector('.c-fabric')?.value || '';
      var name   = tr.querySelector('.c-display-name')?.value || '';
      if(!space && !fabric && !name) return;
      var g = getGroup(space, extractSubLoc(name));
      var role = curtainRole(name);
      g.parts[role] = (g.parts[role]||0) + 1;
    });
    document.querySelectorAll('#blind-body tr').forEach(function(tr){
      var space  = tr.querySelector('.space-inp')?.value || '';
      var kind2  = tr.querySelector('.blind-kind')?.value || '블라인드';
      var name   = tr.querySelector('.b-display-name')?.value || '';
      var fabric = tr.querySelector('.b-fabric')?.value || '';
      if(!space && !fabric && !name) return;
      var g = getGroup(space, extractSubLoc(name));
      g.parts[kind2] = (g.parts[kind2]||0) + 1;
    });
    function groupLabel(space, subLoc) { return space + (subLoc ? '['+subLoc+']' : ''); }
    var CURTAIN_PARTS = {'겉커튼':1,'속커튼':1,'커튼':1}; // 단위가 "장"인 구성요소(나머지는 블라인드류 - "피스")
    var items = [];
    groupOrder.forEach(function(key){
      var g = groups[key];
      var label = groupLabel(g.space, g.subLoc);
      var partKeys = Object.keys(g.parts);
      var desc;
      if (g.parts['겉커튼'] && g.parts['속커튼'] && partKeys.length === 2) {
        desc = '겉커튼+속커튼';
      } else {
        desc = partKeys.map(function(k){
          var n = g.parts[k];
          if (n <= 1) return k;
          return k + ' ' + n + (CURTAIN_PARTS[k] ? '장' : '피스');
        }).join('+');
      }
      items.push(label+' : '+desc);
    });
    if(items.length === 0) {
      out += '<div style="padding:30px 0;text-align:center;color:#B0A99F;font-size:12px">입력된 공간/제품이 없습니다.</div>';
    } else {
      out += '<div class="print-hide" style="text-align:center;font-size:11px;color:#B0A99F;margin-top:8px">✏️ 아래 내용을 클릭하면 발송 전에 직접 고칠 수 있어요</div>';
      out += '<div id="pv-request-editable" contenteditable="true" style="padding:20px 10px;text-align:center;outline:none;border:1px dashed #DDD5CB;border-radius:8px;margin-top:6px">';
      items.forEach(function(txt, i){
        out += '<div style="font-size:13px;color:#282828;padding:8px 0">'+(i+1)+'. '+escHtml(txt)+'</div>';
      });
      out += '</div>';
    }
  } else {
    // ── 시공 의뢰서: 위치/실측사이즈/내용/기타 표 (2026-08-05: "제작사이즈"는 오해 소지가
    // 있어 "실측사이즈"로 정정 — 제작사이즈(보정값 반영)는 가공소 발주할 때만 필요하고,
    // 그건 collectVendorGroups()의 fabSize로 별도 처리됨) ──
    // 2026-09-01(선혜님 지시 - "실측 시공 요청서 해보자", 실제 시공요청서
    // 4개 예시로 비교해서 발견): 기존엔 "기타" 칸에 원단/레일 거래처만
    // 단독으로 나왔는데, 실제 문서는 항상 "캔가공소(제작)/거래처" 조합으로
    // 나옴 - production(제작) 카테고리 거래처를 1곳뿐이면 자동으로 앞에
    // 붙이는 패턴을 printRequest()의 기존 install업체 자동선택과 동일하게 적용.
    // 2026-09-09: 아래 계산은 이제 전역 헬퍼 getAutoProductionVendorName()로
    // 옮김 - collectVendorGroups()(발주서)에서도 재사용해야 해서(가공소가
    // 이제 체크박스 없이 모든 커튼에 자동 적용되므로).
    var productionVendorName = getAutoProductionVendorName();
    function withProduction(etc, isWorkshop) {
      // 2026-09-08(선혜님 지적 - "거래처도 여전히 안되네", 실제 최시내
      // 고객 데이터로 재현 확인): 이 함수가 각 항목이 실제로 "가공소"를
      // 썼는지(vendorIsWorkshop 체크 여부)는 전혀 확인 안 하고, 시스템
      // 전체에 production 카테고리 거래처가 1곳뿐이면 무조건 그 이름을
      // 붙이고 있었음 - 실제로 모든 항목이 vendorIsWorkshop:false(가공소
      // 체크 안 함, 원단 거래처도 비어있음)인데도 "캔가공소"가 무조건
      // 표시되던 명백한 오류. 실제로 가공소를 쓴 항목일 때만 붙도록 수정.
      if (!isWorkshop) return etc || '—';
      if (!etc || etc === '—') return productionVendorName || '—';
      return productionVendorName ? (productionVendorName + '/' + etc) : etc;
    }
    // 2026-09-01: 레일 길이(N자)는 커튼 행 자체엔 저장 안 되고, autoUpdateRail()이
    // svc-body에 별도로 만드는 "레일" 서비스행의 텍스트에만 있음(data-rail-src로
    // 그 레일이 어느 커튼 행에서 왔는지 연결돼있음) - 이걸 찾아서 "내용" 칸에 합침.
    function getRailLengthText(curtainTr) {
      var rowUid = curtainTr.dataset.rowUid;
      var svcBody = document.getElementById('svc-body');
      var railTr = null;
      if (rowUid) {
        railTr = svcBody && svcBody.querySelector('[data-rail-src="' + rowUid + '"]');
      }
      // 2026-09-01(선혜님 지시 - "좀 더 파봐"로 발견, 실제 재현 성공): 저장된
      // 견적서를 다시 열면(restoreLineItemsToForm), 레일 서비스행의 텍스트는
      // 정확히 복원되지만 data-rail-src 속성은 안 붙임(그 정보 자체가 저장된
      // lineItems에 없음) - 그래서 위 매칭이 항상 실패해서, "저장 후 다시 열어
      // 시공요청서 만들기"(오늘 만든 '다시보기' 기능이 정확히 이 경로를 탐 -
      // 실사용에서 가장 흔한 경로)에서 레일길이가 항상 빠지고 있었음. rowUid
      // 매칭이 안 되면, 레일 서비스행 텍스트가 정확히 "그 공간 이름"으로
      // 시작하는지로 폴백 매칭 - 완벽하진 않지만(같은 공간에 레일이 여러개면
      // 첫번째와 매칭) 없는 것보다 훨씬 나음.
      if (!railTr) {
        var space = curtainTr.querySelector('.space-inp')?.value || '';
        if (space && svcBody) {
          var svcRows = svcBody.querySelectorAll('tr');
          for (var i = 0; i < svcRows.length; i++) {
            var inp0 = svcRows[i].querySelectorAll('td')[1]?.querySelector('input');
            var txt0 = inp0 ? inp0.value : '';
            if (txt0.indexOf(space + ' ') === 0 && /자/.test(txt0)) { railTr = svcRows[i]; break; }
          }
        }
      }
      if (!railTr) return '';
      var inp = railTr.querySelectorAll('td')[1] && railTr.querySelectorAll('td')[1].querySelector('input');
      var txt = inp ? inp.value : '';
      var m = txt.match(/(\d+)자/);
      return m ? m[1] + '자 레일' : '';
    }
    var rows = [];
    document.querySelectorAll('#curtain-body tr').forEach(function(tr){
      var space  = tr.querySelector('.space-inp')?.value || '';
      var vendor = tr.querySelector('.c-vendor')?.value || '';
      var railVendor = tr.querySelector('.c-rail-vendor')?.value || '';
      // 2026-09-09(오늘 만든 4단계 - "커튼은 무조건 제작을 해애해"로
      // 가공소 체크박스를 없앴는데, 이 함수(실측/시공 문서용)는 그
      // 체크박스를 여전히 읽고 있어서 항상 false가 되던 회귀버그를
      // 코드정리 중 발견 - collectVendorGroups()(발주서용)와 동일하게
      // 자동배정 여부로 판단하도록 통일.
      var isWorkshop = !!getAutoProductionVendorName();
      var mw = tr.querySelector('.mw')?.value || '';
      var mh = tr.querySelector('.mh')?.value || '';
      var pleat = (tr.querySelector('.pleat-type')?.value || '').replace('형','');
      var open  = (tr.querySelector('.open-type')?.value || '').replace('형','');
      var railLen = getRailLengthText(tr);
      // 2026-09-04(선혜님 지적 - "무슨 제품인지 안나와"로 발견, 실제
      // 스크린샷으로 재현 성공): "내용" 칸이 주름형/개폐형/레일길이만
      // 있고, 정작 무슨 제품(원단/제품명)을 다는지가 전혀 없었음 - 시공
      // 기사님이 봤을 때 "나비주름/양개/18자레일"만으론 어떤 커튼을
      // 달아야 하는지 알 수 없음. 고객용 제품명(있으면)을 맨 앞에 추가,
      // 없으면 원단명으로 대체.
      var productName = (tr.querySelector('.c-display-name')?.value || tr.querySelector('.c-fabric')?.value || '').trim();
      if(!space && !mw && !vendor) return;
      rows.push({
        space: space||'—',
        size: (mw&&mh) ? (mw+'×'+mh) : '—',
        content: [productName, [pleat, open, railLen].filter(Boolean).join(' / ')].filter(Boolean).join(' — ')||'—',
        // 2026-08-13: 원단거래처(vendor)는 시공기사가 알 필요없는 내부정보라
        // 노출하지 않고, 대신 레일거래처(railVendor)를 노출 - 레일은 브랜드별로
        // (전동레일 등) 시공방식이 달라서 기사님이 반드시 알아야 함(선혜님 확인)
        etc: withProduction(railVendor, isWorkshop)
      });
    });
    document.querySelectorAll('#blind-body tr').forEach(function(tr){
      var space  = tr.querySelector('.space-inp')?.value || '';
      var vendor = tr.querySelector('.b-vendor')?.value || '';
      var bname  = tr.querySelector('.b-display-name')?.value || '';
      var bmw = tr.querySelector('.bmw')?.value || '';
      var bmh = tr.querySelector('.bmh')?.value || '';
      var handle = tr.querySelector('.handle-dir')?.value || '';
      var blindKind = tr.querySelector('.blind-kind')?.value || '';
      var cordLength = tr.querySelector('.b-cord-length')?.value || '';
      if(!space && !bmw && !vendor && !bname) return;
      rows.push({
        space: space||'—',
        size: (bmw&&bmh) ? (bmw+'×'+bmh) : '—',
        // 2026-09-09(선혜님 지적 - "블라인드는 끈길이도 적을 수 있게
        // 해줘야 하는데 그게 안되네"): 끈길이 정보를 내용 칸에 추가 -
        // 시공기사님이 실제 끈길이를 알아야 정확히 시공 가능.
        content: [blindKind, handle ? ((handle==='기타'||handle==='노코드')?handle:handle+'잡이') : '', cordLength ? ('끈길이 '+cordLength) : ''].filter(Boolean).join(' — ')||'—',
        // 2026-09-08(선혜님 지적 - "블라인드도 지금은 가공소로 들어가있어",
        // 직접 수정한 파일과 비교해 발견): 블라인드는 완제품을 그대로
        // 구매하는 거라 원단을 재단하는 "가공소" 공정 자체가 없는데,
        // withProduction()(제작 거래처가 1곳뿐이면 자동으로 이름을 앞에
        // 붙이는 커튼 전용 로직)을 그대로 재사용해서 블라인드에도 실수로
        // 가공소 이름이 붙고 있었음 - 블라인드는 순수 거래처명만 표시.
        etc: vendor || '—'
      });
    });

    // 2026-09-08(선혜님 지시 - "고객견적서에 있는 공간 순서대로 정리해주면
    // 될꺼 같고"): 9/4에는 "공간별로 나오게 해줘"라는 요청으로 가나다순
    // 정렬을 추가했었는데, 이번엔 견적서에 입력한 순서 그대로가 낫다는
    // 요구로 바뀌어 정렬 로직을 제거했었음 - 근데 이러면 같은 공간에
    // 커튼과 블라인드가 둘 다 있을 때, 커튼 전체(모든 공간)가 먼저,
    // 블라인드 전체(모든 공간)가 나중에 오는 구조(rows는 커튼 배열 뒤에
    // 블라인드 배열을 이어붙인 것)라서, 같은 공간이 서로 뚝 떨어진 두
    // 그룹으로 쪼개져 나오는 새 문제가 생김("시륵 시공 정리할때 공간별로
    // 묶어달라고!!!"로 재발견). 가나다순은 아니면서도 같은 공간은 붙어
    // 있어야 하므로, "이 공간이 rows 안에서 처음 나온 위치" 기준으로
    // 안정정렬 - 공간 그룹의 순서는 입력 순서를 그대로 따르고, 그 안에서
    // 커튼/블라인드가 섞여도 같은 공간끼리는 항상 붙어서 나옴.
    var spaceFirstOrder = {};
    rows.forEach(function(r, i) { if (!(r.space in spaceFirstOrder)) spaceFirstOrder[r.space] = i; });
    rows.sort(function(a, b) { return spaceFirstOrder[a.space] - spaceFirstOrder[b.space]; });

    if(rows.length === 0) {
      out += '<div style="padding:30px 0;text-align:center;color:#B0A99F;font-size:12px">입력된 공간/제품이 없습니다.</div>';
    } else {
      out += '<div class="print-hide" style="text-align:center;font-size:11px;color:#B0A99F;margin-top:8px">✏️ 아래 표를 클릭하면 발송 전에 직접 고칠 수 있어요</div>';
      out += '<div id="pv-request-editable" contenteditable="true" style="outline:none;border:1px dashed #DDD5CB;border-radius:8px;margin-top:6px;padding:4px">';
      out += '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:2px">'
          +'<thead><tr style="border-bottom:1.5px solid #282828;background:#FAF7F5">'
          +'<th style="text-align:left;padding:8px 6px">위치</th>'
          +'<th style="text-align:center;padding:8px 6px">실측사이즈</th>'
          +'<th style="text-align:left;padding:8px 6px">내용</th>'
          +'<th style="text-align:left;padding:8px 6px">기타</th>'
          +'</tr></thead><tbody>';
      var lastSpace = null;
      var lastSize = null;
      rows.forEach(function(r){
        var spaceChanged = (r.space !== lastSpace);
        var spaceCell = spaceChanged ? escHtml(r.space) : '';
        lastSpace = r.space;
        // 2026-09-01(선혜님 지시 - "니머지는?"으로 이어서 진행, 실제 시공요청서
        // 예시 이미지4에서 발견): 같은 위치(예: 거실) 안에서 여러 항목이 같은
        // 사이즈를 공유하면(예: 겉커튼+속커튼이 같은 창), 사이즈도 위치처럼
        // 빈칸으로 병합해서 표시함 - 단, 위치가 바뀌면 사이즈도 반드시 다시
        // 표시(다른 방의 우연히 같은 사이즈와 잘못 병합되면 안 되므로 리셋).
        if (spaceChanged) lastSize = null;
        var sizeCell = (r.size === lastSize) ? '' : escHtml(r.size);
        lastSize = r.size;
        out += '<tr style="border-bottom:1px solid #EEE6DC">'
            +'<td style="padding:8px 6px;font-weight:700">'+spaceCell+'</td>'
            +'<td style="padding:8px 6px;text-align:center">'+sizeCell+'</td>'
            +'<td style="padding:8px 6px">'+escHtml(r.content)+'</td>'
            +'<td style="padding:8px 6px;color:#8E8078">'+escHtml(r.etc)+'</td>'
            +'</tr>';
      });
      out += '</tbody></table>';
      out += '</div>';
    }
  }

  if(extraNote) {
    out += '<div id="pv-request-note-editable" contenteditable="true" style="margin-top:var(--sp-6);text-align:center;font-size:13px;color:#E4483A;font-weight:600;line-height:1.7;white-space:pre-wrap;outline:none;border:1px dashed #F0C9C4;border-radius:8px;padding:8px">'+escHtml(extraNote)+'</div>';
  }

  out += '</div>';
  return out;
}


function printRequest(kind, skipPrompts) {
  calcTotal();
  var label = kind==='measure' ? '실측' : '시공';

  // 2026-09-04(선혜님 지시 - "주소/실측일자/시공일자도 기입 안하면 경고가
  // 떠야할것 같은데?"로 확장): 지역 미입력 경고를 만들고 나서, "정작 더
  // 중요한 주소/날짜는 저장(saveEstimate) 시점에만 확인하고, 정작 시공
  // 기사가 실제로 쓰는 이 문서(시공/실측요청서) 생성 시점엔 확인이 없었다"
  // 는 정확한 지적으로 추가. 시공요청서는 시공일을, 실측요청서는 실측일을
  // 확인 대상으로 삼음(문서 성격에 맞는 날짜만 - 시공요청서에 실측일이
  // 없다고 경고하는 건 무의미하므로). 여러 항목이 한꺼번에 비어있으면
  // 개별 확인창이 연달아 뜨지 않도록 모아서 한 번에 보여줌. 날짜미정
  // 체크박스가 되어있으면 그 항목은 빠뜨림으로 안 잡음(진짜 미정이니까).
  // 다시보기(autoDoc, skipPrompts=true)일 땐 이미 저장된 값 그대로
  // 자동으로 보여주는 흐름이라 전부 건너뜀(경고가 뜨면 자동화가 멈춤).
  if (!skipPrompts) {
    var missingForDoc = [];
    if (!(document.getElementById('c-region')?.value || '')) missingForDoc.push('지역(레일 길이 등 일부 정보가 자동으로 안 채워질 수 있어요)');
    if (!(document.getElementById('c-addr')?.value || '').trim()) missingForDoc.push('주소');
    if (kind === 'measure' && !document.getElementById('c-measure-tbd')?.checked && !(document.getElementById('c-measure')?.value || '')) missingForDoc.push('실측 예정일');
    if (kind === 'install' && !document.getElementById('c-install-tbd')?.checked && !(document.getElementById('c-install')?.value || '')) missingForDoc.push('시공 예정일');
    if (missingForDoc.length > 0) {
      var proceedMissing = window.confirm('다음 항목이 비어있어요:\n\n' + missingForDoc.join('\n') + '\n\n그래도 ' + label + '요청서를 만드시겠어요?');
      if (!proceedMissing) return;
    }
  }

  // 설치기사 정보는 견적서 화면에는 노출하지 않고, 의뢰서 생성 시점에만 물어봄
  var installerNameEl = document.getElementById('c-installer-name');
  var installerPhoneEl = document.getElementById('c-installer-phone');
  var currentInstallerName = installerNameEl ? installerNameEl.value : '';
  var currentInstallerPhone = installerPhoneEl ? installerPhoneEl.value : '';
  // 2026-08-26(선혜님 발견 — "거래처 등록을 했는데 왜 수기로 다 써야 하지"):
  // 이 견적에 아직 설치기사 정보가 없고(=이번이 처음 묻는 거고), 설정탭
  // 거래처관리에서 '실측·시공' 담당으로 등록해둔 곳이 정확히 1곳뿐이면
  // 그 정보로 자동 채움 - 그 경우 사용자는 그냥 "확인"만 누르면 됨(여전히
  // 필요하면 팝업에서 직접 고쳐 쓸 수 있음). 등록된 곳이 없거나 2곳 이상
  // (누구인지 특정 불가)이면 예전처럼 빈 값으로 물어봄.
  if (!currentInstallerName && !currentInstallerPhone && Array.isArray(window._dahVendorListRaw)) {
    var installVendors = window._dahVendorListRaw.filter(function(v) {
      return v && Array.isArray(v.categories) && v.categories.indexOf('install') >= 0;
    });
    if (installVendors.length === 1) {
      currentInstallerName = installVendors[0].name || '';
      currentInstallerPhone = installVendors[0].phone || '';
    }
  }
  // 2026-09-09(선혜님 지시 - "실측/시공을 어떻게 하는지" 논의에서 확정 -
  // "지금 창(설치기사명/연락처 묻는 것)을 발주서처럼 큰 팝업 화면으로
  // 개선하기"): window.prompt() 3연발(이름→연락처→비고, 한 번에 하나씩만
  // 물어봐서 어수선함)을 발주정보 팝업과 같은 스타일의 큰 화면 하나로
  // 교체. 실제 미리보기 표시 로직은 _showRequestPreview()로 분리해서,
  // 팝업의 "확인" 콜백에서 호출하도록 함(skipPrompts 경로는 팝업 없이
  // 바로 호출).
  if (!skipPrompts) {
    openInstallerInfoModal(label, currentInstallerName, currentInstallerPhone, function(name, phone, note) {
      if (installerNameEl) installerNameEl.value = name;
      if (installerPhoneEl) installerPhoneEl.value = phone;
      _showRequestPreview(kind, label, note);
    });
    return;
  }
  if (installerNameEl) installerNameEl.value = currentInstallerName;
  if (installerPhoneEl) installerPhoneEl.value = currentInstallerPhone;
  _showRequestPreview(kind, label, '');
}

// 2026-09-09: 설치기사명/연락처/비고를 한 화면에서 입력받는 팝업 -
// 발주정보 입력 팝업과 같은 스타일. 확인을 누르면 onConfirm(name, phone,
// note)를 호출하고, 취소/닫기를 누르면 아무 것도 안 하고 닫힘.
function openInstallerInfoModal(label, currentName, currentPhone, onConfirm) {
  var existing = document.getElementById('installer-info-modal');
  if (existing) existing.remove();

  var ov = document.createElement('div');
  ov.id = 'installer-info-modal';
  ov.className = 'print-hide';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#F5F2EE;z-index:10000;overflow-y:auto;display:flex;flex-direction:column';

  var nav = document.createElement('div');
  nav.style.cssText = 'position:sticky;top:0;z-index:10001;background:#282828;padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:52px;flex-shrink:0';
  var navLabel = document.createElement('span');
  navLabel.textContent = label + ' 담당자 정보';
  navLabel.style.cssText = 'color:rgba(255,255,255,0.9);font-size:13px;font-weight:700;white-space:nowrap';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.onclick = function(){ ov.remove(); };
  closeBtn.style.cssText = 'padding:7px 16px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit;white-space:nowrap';
  nav.appendChild(navLabel);
  nav.appendChild(closeBtn);

  var content = document.createElement('div');
  content.style.cssText = 'flex:1;padding:24px 16px 60px;display:flex;justify-content:center';
  var wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;max-width:420px;background:#fff;border-radius:12px;padding:20px';

  function makeField(labelText, placeholder, value) {
    var fieldWrap = document.createElement('div');
    fieldWrap.style.cssText = 'margin-bottom:14px';
    var lbl = document.createElement('div');
    lbl.textContent = labelText;
    lbl.style.cssText = 'font-size:12px;font-weight:700;color:#282828;margin-bottom:6px';
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = value || '';
    input.style.cssText = 'width:100%;padding:11px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box';
    fieldWrap.appendChild(lbl); fieldWrap.appendChild(input);
    wrap.appendChild(fieldWrap);
    return input;
  }

  var nameInput = makeField('설치기사명', '이름을 입력하세요', currentName);
  var phoneInput = makeField('연락처', '010-0000-0000', currentPhone);

  var noteLbl = document.createElement('div');
  noteLbl.textContent = '비고 (선택)';
  noteLbl.style.cssText = 'font-size:12px;font-weight:700;color:#282828;margin-bottom:6px';
  var noteInput = document.createElement('textarea');
  noteInput.placeholder = '담당자에게 남길 메모가 있으면 입력하세요';
  noteInput.style.cssText = 'width:100%;min-height:80px;padding:11px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box;resize:vertical';
  wrap.appendChild(noteLbl); wrap.appendChild(noteInput);

  var confirmBtn = document.createElement('button');
  confirmBtn.textContent = '확인 → ' + label + '요청서 보기';
  confirmBtn.style.cssText = 'width:100%;padding:12px;background:#282828;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:6px';
  confirmBtn.onclick = function(){
    ov.remove();
    onConfirm(nameInput.value, phoneInput.value, noteInput.value);
  };
  wrap.appendChild(confirmBtn);

  content.appendChild(wrap);
  ov.appendChild(nav);
  ov.appendChild(content);
  document.body.appendChild(ov);
}

function _showRequestPreview(kind, label, extraNote) {
  var html = buildRequestHTML(kind, extraNote);

  var cNameForDrive = document.getElementById('c-name')?.value || '미지정고객';
  // 2026-08-26(선혜님 발견 — "자동으로 적히지만 수정할 부분이 있을 수도 있는데,
  // 마지막 발송전에 수정할 수 있게 가능하니"): 예전엔 미리보기가 뜨기도 전에
  // 이 시점(생성 직후)에 구글드라이브 저장이 먼저 끝나버려서, 그 뒤 미리보기에서
  // 내용을 고쳐도 이미 저장된 문서엔 반영이 안 됐음(애초에 고칠 수도 없었음).
  // 아래에서 "내용"/메모 영역을 contenteditable로 만들고, 드라이브 저장도
  // "인쇄/PDF저장" 버튼을 실제로 눌러 최종 확정하는 시점으로 미룸 - 그때
  // 화면에 떠 있는(수정됐을 수 있는) 최신 내용을 그대로 저장함.

  var existing = document.getElementById('pv-overlay');
  if(existing) existing.remove();

  var ov = document.createElement('div');
  ov.id = 'pv-overlay';
  ov.style.cssText = [
    'position:fixed;top:0;left:0;width:100%;height:100%',
    'background:#F5F2EE;z-index:9999;overflow-y:auto;overflow-x:auto',
    'display:flex;flex-direction:column'
  ].join(';');

  var nav = document.createElement('div');
  nav.className = 'print-hide';
  nav.style.cssText = [
    'position:sticky;top:0;z-index:10001',
    'background:#282828;padding:0 24px',
    'display:flex;align-items:center;justify-content:space-between',
    'height:52px;flex-shrink:0'
  ].join(';');
  var navLabel = document.createElement('span');
  navLabel.textContent = label+' 의뢰서 미리보기';
  navLabel.style.cssText = 'color:rgba(255,255,255,0.6);font-size:11px;font-weight:600;letter-spacing:0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1 1 auto;margin-right:8px';
  var navBtns = document.createElement('div');
  navBtns.style.cssText = 'display:flex;gap:var(--sp-2);flex-shrink:0';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.onclick = function(){
    document.getElementById('pv-overlay').remove();
    document.body.style.overflow = '';
    document.body.classList.remove('preview-open');
  };
  closeBtn.style.cssText = 'padding:7px 16px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit;white-space:nowrap;flex-shrink:0';
  var printBtn = document.createElement('button');
  printBtn.textContent = '인쇄 / PDF 저장';
  printBtn.onclick = function() {
    try {
      var finalHtml = inner ? inner.innerHTML : html;
      // 2026-08-27(선혜님 발견 — "발주서 이런거는 정리된게 없어, 제대로
      // 안들어오는거 같은데"로 구글드라이브 문서보관함을 전수조사하다 발견):
      // 예전엔 파일명 구분자에 label(실측/시공)뿐 아니라 설치기사 이름까지
      // 같이 들어가고 있었음(instNameForDrive). 구글Apps Script의 저장
      // 로직은 "같은 [연월]/[고객명]/[문서종류] 파일명이면 덮어쓰기"인데,
      // 설치기사 이름이 비어있다가 나중에 채워지면(오늘 만든 "거래처 등록
      // 연동 자동입력" 기능 덕에 앞으로 더 자주 채워질 것) 파일명 자체가
      // 바뀌어서 예전 파일이 안 지워지고 계속 쌓임(실제로 유경진 폴더에
      // "실측시공_실측.html"과 "실측시공_실측_유지철팀장님.html" 두 개가
      // 남아있는 것 확인함). 설치기사 이름은 문서 "내용"에 이미 표시되고
      // 있으니, 파일명 구분자에서는 빼고 label(실측/시공)만 남김.
      var cStaffForDrive3 = document.getElementById('c-staff')?.value || '';
      saveDocumentToDrive('실측시공', cNameForDrive, label, finalHtml, cStaffForDrive3);
      // 2026-09-09: 발주(order_status.fabric/production/material/blind)는
      // 이미 자동 기록되고 있었는데, 실측/시공은 전혀 기록이 안 되고
      // 있었음 - "업무처리" 통합 탭에서 세 가지 진행상태를 보여주려면
      // 여기도 똑같이 기록해야 함. kind가 'measure'/'install' 그대로
      // order_status의 카테고리 키가 됨(기존 install 카테고리 이름과 일치).
      var installerNameForStatus = document.getElementById('c-installer-name')?.value || '';
      var statusUpdate = {};
      statusUpdate[kind] = { done: true, vendor: installerNameForStatus, orderDate: new Date().toISOString().slice(0, 10) };
      if (typeof updateOrderStatus === 'function') updateOrderStatus(statusUpdate);
      // 2026-09-10: 발주와 동일하게, 실측/시공 완료 직후에도 업무처리
      // 카드를 다시 그려서 새로고침 없이 바로 반영되게 함.
      if (typeof renderWorkStatusCards === 'function') setTimeout(renderWorkStatusCards, 800);
      // 2026-09-09(선혜님 지시 - "실측/시공/발주가 다 따로 되어있다" →
      // 업무처리 통합탭 기획 중 "이 정보가 왜 저장이 안 되지" 확인):
      // 설치기사 이름/연락처가 지금까지 DB에 전혀 저장이 안 되고 있었음 -
      // 같은 견적서를 다른 날 다시 열면(예: 실측 때 입력한 정보를 나중에
      // 시공의뢰서 만들 때 재사용) 완전히 사라져서 매번 새로 입력해야
      // 했음. estimates.installer_name/installer_phone 컬럼 신설,
      // 발주상태 기록과 같은 시점(실제 저장 확정 시점)에 즉시 DB 반영 -
      // 견적서 "저장" 버튼을 따로 안 눌러도 남도록.
      if (window._estEditState.editingEstDbId && typeof SUPABASE_URL !== 'undefined') {
        var installerPhoneForSave = document.getElementById('c-installer-phone')?.value || '';
        try {
          var xhrInstaller = new XMLHttpRequest();
          xhrInstaller.open('PATCH', SUPABASE_URL + '/rest/v1/estimates?id=eq.' + encodeURIComponent(window._estEditState.editingEstDbId), true);
          xhrInstaller.setRequestHeader('apikey', SUPABASE_KEY);
          xhrInstaller.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
          xhrInstaller.setRequestHeader('Content-Type', 'application/json');
          xhrInstaller.onerror = function() { console.warn('설치기사 정보 저장 실패'); typeof reportClientError==='function' && reportClientError('설치기사 정보 저장 실패'); };
          xhrInstaller.send(JSON.stringify({ installer_name: installerNameForStatus, installer_phone: installerPhoneForSave }));
        } catch (eInstaller) { console.warn('설치기사 정보 저장 실패:', eInstaller); typeof reportClientError==='function' && reportClientError('설치기사 정보 저장 실패: ' + (eInstaller && eInstaller.message || eInstaller), eInstaller && eInstaller.stack); }
      }
    } catch(e) { console.warn('의뢰서 드라이브 저장 실패:', e); typeof reportClientError==='function' && reportClientError('의뢰서 드라이브 저장 실패: ' + (e && e.message || e), e && e.stack); }
    openPdfModal();
  };
  printBtn.style.cssText = 'padding:7px 18px;background:#282828;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;white-space:nowrap;flex-shrink:0';
  navBtns.appendChild(closeBtn);
  navBtns.appendChild(printBtn);
  nav.appendChild(navLabel);
  nav.appendChild(navBtns);

  var content = document.createElement('div');
  content.style.cssText = 'flex:1;padding:32px 20px 60px;display:flex;justify-content:center';
  var inner = document.createElement('div');
  inner.style.cssText = 'width:100%;max-width:640px';
  inner.innerHTML = html;
  content.appendChild(inner);

  ov.appendChild(nav);
  ov.appendChild(content);
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  document.body.classList.add('preview-open');
}
