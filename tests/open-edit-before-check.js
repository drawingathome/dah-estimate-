// tests/open-edit-before-check.js
// 2026-11-20 N-205: 견적서를 연 직후(검사가 끝나기 전) 사람이 칸을 고치거나 '+ 블라인드 추가'를 누르면 그 변화가 '열 때 생긴 금액 차이'로 기록·경고되던 것.
//  옛 코드: outcome='mismatch' + 경고 배너. 새 코드: outcome='edited-before-check', 경고 없음, 영수증에 user_touched=true와 열기 직후 줄 수.
//  무동작 대조군은 그대로 'ok'. (실제 마우스 클릭으로 시험 — isTrusted. 한계: 가짜 서버 시험이며 운영 화면 확인이 아님. 약 1분.)
// N-205 재현 시험 (읽기 전용 검토용, 운영 DB 접속 없음 - 가짜 서버 응답)
// 실행: export DAH_PUPPETEER_PATH=/opt/npm-tools/node_modules/puppeteer DAH_CHROME_PATH=/usr/bin/google-chrome; node /tmp/n205-repro.js [시나리오이름...]
const { launchBrowser, startServer, loginAs } = require('./_helpers');
const cur=(space,mw,mh,pnum,price,dn)=>({type:'curtain',space,mw,mh,pnum,price,amt:'',displayName:dn,pleatType:'나비주름형',openType:'양개형',hemType:'리드',heightAdjust:'-3',shapeProcess:true,fabric:'',vendor:'',color:'',yardage:'',railVendor:'',fabricUnitPrice:''});
function baseItems(){ return [
 cur('거실','480','250','8',242000,'세임'), cur('거실','480','250','6',165000,'메종'), cur('안방','240','255','3',108900,'젤리'),
 cur('침실2','300','250','4',108900,'셀마'), cur('침실2','300','250','4',93500,'헤이즈'),
 {type:'blind',space:'주방',bmw:'120',bmh:'143',kind:'알루미늄',price:65000,displayName:'C자형',handle:'좌손',fabric:'',vendor:'',color:'',opt:'',bottomBar:'',cordLength:''},
 {type:'svc',qty:'1',kind:'실측비',price:40000,space:'',content:'서울 실측비',autoType:'measure',override:false},
 {type:'svc',qty:'1',kind:'시공비',price:50000,space:'',content:'서울 시공비',autoType:'install',override:false},
 ...[['거실',16],['거실',16],['안방',8],['침실2',10],['침실2',10]].flatMap(([sp,ja])=>[{type:'svc',qty:String(ja),kind:'레일',price:1600,space:sp,content:'조절레일(타공형) '+ja+'자',autoType:'rail',override:false},{type:'svc',qty:'1',kind:'시공비',price:25000,space:sp,content:'레일 시공비',autoType:'railcost',override:false}]),
 {type:'svc',qty:'1',kind:'시공비',price:10000,space:'',content:'블라인드 시공비 (1개)',autoType:'blindInstall',override:false}]; }
const COUPONS=[{id:'c3',name:'입주',type:'pct',value:10},{id:'c1',name:'당일결제',type:'pct',value:5}];
// 저장 금액은 '가짜 환경 첫 열기'의 정상 합계로 맞춤(아래 calibrate에서 채움)
let STORED=null;
function makeRow(mod){ const items=baseItems();
  const row={id:'t-est',client_id:999,customer_name:'시험',phone:'010-0000-0000',region:'서울',estimate_status:'ga',price:STORED||0,date:'',measure_date_tbd:false,install_date_tbd:false,
   price_breakdown:{finalTotal:STORED||0,svcRowsSaved:true},
   applied_discounts:{manual:null,coupons:[{id:'c3',name:'입주',type:'pct',value:10,amount:0}]}, line_items:items, updated_at:'2026-10-20T03:01:00Z'};
  if(mod) mod(row); return row; }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(name, cfg){
  const server = await startServer(require('path').resolve(__dirname,'..'), cfg.port||9990); const browser = await launchBrowser();
  const page = await browser.newPage(); const receipts=[]; const errs=[];
  page.on('pageerror', e=>errs.push(e.message)); page.on('dialog', async d=>{ try{await d.accept();}catch(e){} });
  const row = makeRow(cfg.rowMod); if(cfg.stored!=null){ row.price=cfg.stored; row.price_breakdown.finalTotal=cfg.stored; }
  await page.setRequestInterception(true);
  page.on('request', req=>{ const u=req.url(); if(u.startsWith('http://localhost')||u.startsWith('http://127.0.0.1')) return req.continue();
    if(u.includes('supabase.co')){ const h={'Access-Control-Allow-Origin':'*'}; const respond=(body,delay)=>setTimeout(()=>{ try{req.respond({status:200,contentType:'application/json',headers:h,body:JSON.stringify(body)});}catch(e){} }, delay||0);
      if(req.method()==='OPTIONS') return req.respond({status:204,headers:{...h,'Access-Control-Allow-Methods':'*','Access-Control-Allow-Headers':'*'}});
      if(req.method()==='POST' && u.includes('save_receipts')){ try{ receipts.push(JSON.parse(req.postData())); }catch(e){} return req.respond({status:201,headers:h,body:''}); }
      if(req.method()==='GET' && u.includes('/rest/v1/estimates?id=eq.t-est')) return respond([row], cfg.estDelay);
      if(req.method()==='GET' && u.includes('/rest/v1/customers?id=eq.999')) return respond([{addr:'서울 시험구',addr_detail:'1동',measure_date:null,install_date:null,deposit_amount:0}], cfg.addrDelay);
      if(req.method()==='GET' && u.includes('key=eq.discount_coupons')) return respond([{value:COUPONS}], cfg.couponDelay);
      return respond([], 0); }
    req.abort(); });
  await page.setViewport({width:1280,height:1600});
  await page.goto('http://localhost:'+(cfg.port||9990)+'/dah-estimate.html',{waitUntil:'domcontentloaded',timeout:15000});
  await sleep(900); await loginAs(page,'master'); await sleep(800);
  if(cfg.couponCache) await page.evaluate(c=>localStorage.setItem('dah_discount_coupons', JSON.stringify(c)), COUPONS); else await page.evaluate(()=>localStorage.removeItem('dah_discount_coupons'));
  const t0=Date.now();
  await page.goto('http://localhost:'+(cfg.port||9990)+'/dah-estimate.html?loadEstDbId=t-est&mode=edit',{waitUntil:'domcontentloaded',timeout:15000});
  const state = ()=>page.evaluate(()=>({ total:document.getElementById('sum-total').textContent, blind:document.querySelectorAll('#blind-body tr').length, cur:document.querySelectorAll('#curtain-body tr').length,
     blindInstall:[...document.querySelectorAll('#svc-body tr')].filter(r=>r.getAttribute('data-svc-type')==='블라인드시공').map(r=>r.querySelector('.svc-content').value+' x'+r.querySelector('.sqty').value), svcN:document.querySelectorAll('#svc-body tr').length,
     saveDisabled:!!(document.getElementById('btn-save-estimate')||{}).disabled }));
  const log=[]; const steps=cfg.steps||[]; let si=0; const end=cfg.until||30000;
  while(Date.now()-t0<end){ const el=Date.now()-t0;
    while(si<steps.length && steps[si].at<=el){ try{ await steps[si].do(page); }catch(e){ log.push('step err '+e.message);} log.push('['+el+'ms] 동작: '+steps[si].label); si++; }
    if(Math.floor(el/1000)!==Math.floor((el-250)/1000) && [2,4,6,8,10,15,20,25].includes(Math.floor(el/1000))) log.push('['+Math.floor(el/1000)+'s] '+JSON.stringify(await state()));
    await sleep(250); }
  const open = receipts.filter(r=>r.kind==='open');
  const out = {name, errs, log, opens: open.map(r=>({outcome:r.outcome, shown:r.detail.shown_total, stored:r.detail.stored_price, blind_rows:r.detail.snapshot.blind_rows, svc:r.detail.snapshot.svc_rows.filter(s=>s.t==='블라인드시공').map(s=>s.c+' x'+s.q)}))};
  await browser.close(); server.close(); return out;
}
(async()=>{
  let fail=0; const ok=(l,c,d)=>{ console.log((c?'✅ ':'❌ ')+l+(c?'':' — '+(d||''))); if(!c) fail++; };
  const cal = await run('보정', {port:9990, couponCache:true, stored:1, until:14000});
  STORED = parseInt(String(cal.opens[0]&&cal.opens[0].shown||0),10);
  const A = await run('A', {port:9991, couponCache:true, until:28000});
  const hold={at:3000,label:'저장 버튼 잠금(쿠폰 복원 중 흉내)',do:async p=>{ await p.evaluate(()=>{ var g=document.getElementById('est-auth-gate'); if(g) g.style.display='none'; document.getElementById('btn-save-estimate').disabled=true; }); }};
  const release={at:11000,label:'잠금 해제',do:async p=>{ await p.evaluate(()=>{ document.getElementById('btn-save-estimate').disabled=false; }); }};
  const clickBlind={at:5000,label:'실제 키보드 입력(가로 칸)',do:async p=>{ await p.$eval('#curtain-body tr .mw',b=>b.scrollIntoView({block:'center'})); await p.click('#curtain-body tr .mw',{clickCount:3}); await p.keyboard.type('520'); await p.keyboard.press('Tab'); }};
  const B = await run('B', {port:9992, couponCache:true, until:30000, steps:[hold,clickBlind,release]});
  const oa=A.opens[0]||{}, ob=B.opens[0]||{};
  ok('A 무동작: 열기 결과 ok', oa.outcome==='ok', JSON.stringify(A.opens));
  ok('B 직접 입력: 사람이 고쳤으면 mismatch가 아니라 edited-before-check', ob.outcome==='edited-before-check', JSON.stringify(B.opens));
  ok('B: 화면 합계는 실제로 바뀌었음(전제)', ob.shown!==ob.stored, JSON.stringify(ob));
  ok('JS 오류 없음', !A.errs.length && !B.errs.length, JSON.stringify([A.errs,B.errs]));
  process.exit(fail?1:0);
})();
