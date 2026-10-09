// 2026-10-09 고정 자동화: 예전 형식 + 계약금 있음 + 저장금액=화면금액이면 열 때 자동으로 행을 고정 저장. 금액이 다르거나 계약금 없는 가견적이거나 이미 고정된 건 절대 쓰지 않음
const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession } = require('./_helpers');
const baseRows=[{"id": "38f4dfda-82be-4697-81ad-97520a1327d6", "customer_name": "박윤아", "price": 1361000, "deposit_amount": 100000, "balance_amount": 1261000, "date": "2026-09-28", "client_id": 216, "branch": "반포점", "region": "서울", "phone": "010-2561-5776", "space": "거실", "install_date": "2026-10-13", "estimate_status": "final", "price_breakdown": {"balance": 1261000, "deposit": 100000, "discount": 92400, "finalTotal": 1361000, "discountDetail": [{"label": "당일결제 5%", "amount": 58300}, {"label": "마케팅 3%", "amount": 33231}, {"label": "끝자리 절사", "amount": 869}], "installSubtotal": 287400, "productSubtotal": 1166000, "performanceRevenue": 1073600}, "applied_discounts": {"manual": null, "coupons": [{"id": "c1", "name": "당일결제", "type": "pct", "value": 5, "amount": 58300}, {"id": "c2", "name": "마케팅", "type": "pct", "value": 3, "amount": 33231}]}, "line_items": [{"mh": "262", "mw": "386", "amt": "726,000원", "pnum": "6", "type": "curtain", "price": 121000, "space": "거실", "vendor": "예원", "hemType": "5cm", "openType": "편개형", "pleatType": "나비주름형", "railVendor": "목성", "displayName": "린 arco 5826-14", "heightAdjust": "-3", "shapeProcess": true}, {"amt": "100,000원", "bmh": "85", "bmw": "178", "opt": "D자형 이지블라인드/하단감쌈", "kind": "롤스크린", "type": "blind", "extra": 35000, "price": 50000, "space": "안방", "handle": "노코드", "displayName": "Amalfi RM-02 아이보리"}, {"amt": "100,000원", "bmh": "85", "bmw": "57", "opt": "D자형 이지블라인드/하단감쌈", "kind": "롤스크린", "type": "blind", "extra": 35000, "price": 50000, "space": "안방", "handle": "노코드", "displayName": "Amalfi RM-02 아이보리"}, {"amt": "140,000원", "bmh": "175", "bmw": "158", "opt": "노코드 /하단감쌈", "kind": "롤스크린", "type": "blind", "extra": 48000, "price": 50000, "space": "자녀방", "handle": "노코드", "displayName": "Amalfi RM-02 아이보리"}, {"amt": "100,000원", "bmh": "175", "bmw": "76", "opt": "노코드/하단감쌈", "kind": "롤스크린", "type": "blind", "extra": 48000, "price": 50000, "space": "자녀방", "handle": "노코드", "displayName": "Amalfi RM-02 아이보리"}, {"qty": "1", "kind": "전동", "type": "svc", "price": 160000, "content": "D자형 이지블라인드/하단감쌈, 노코드 /하단감쌈, 노코드/하단감쌈 ✏️직접수정", "autoType": "option"}], "cust_type": "new", "confirmed_at": "2026-09-01T00:00:00Z", "deposit_date": "2026-09-04", "install_date_tbd": false, "measure_date_tbd": false}, {"id": "814c4216-9f5f-4119-b66e-d64ff163ab1a", "customer_name": "유경진", "price": 3383000, "deposit_amount": 1000000, "balance_amount": 2383000, "date": "2026-08-28", "client_id": 171, "branch": "반포점", "region": "서울", "phone": "010-2302-8531", "space": "거실, 거실, 거실, 안방, 서재, 기타", "install_date": "2026-09-29", "estimate_status": "final", "price_breakdown": {"balance": 2383000, "deposit": 1000000, "discount": 159400, "finalTotal": 3383000, "discountDetail": [{"label": "당일결제 5%", "amount": 159160}, {"label": "끝자리 절사", "amount": 240}], "installSubtotal": 359200, "productSubtotal": 3183200, "performanceRevenue": 3023800}, "applied_discounts": {"manual": null, "coupons": [{"id": "c1", "name": "당일결제", "type": "pct", "value": 5, "amount": 159160}]}, "line_items": [{"mh": "250", "mw": "435", "amt": "550,000원", "pnum": "5", "type": "curtain", "price": 110000, "space": "거실", "hemType": "5cm", "openType": "양개형", "pleatType": "민자형", "displayName": "[정면] 린 베이지 겉커튼", "heightAdjust": "-3"}, {"mh": "250", "mw": "435", "amt": "945,000원", "pnum": "7", "type": "curtain", "price": 135000, "space": "거실", "hemType": "리드", "openType": "양개형", "pleatType": "나비주름형", "displayName": "[정면] 시소코 아이보리 속커튼", "heightAdjust": "-3"}, {"mh": "249", "mw": "180", "amt": "405,000원", "pnum": "3", "type": "curtain", "price": 135000, "space": "거실", "hemType": "리드", "openType": "편개형", "pleatType": "나비주름형", "displayName": "[측면]  시소코 아이보리 속커튼", "heightAdjust": "-3"}, {"mh": "250", "mw": "180", "amt": "198,000원", "pnum": "2", "type": "curtain", "price": 99000, "space": "안방", "hemType": "8cm", "openType": "양개형", "pleatType": "민자형", "displayName": "에센셜 암막커튼 알라버스터", "heightAdjust": "-3"}, {"mh": "249", "mw": "190", "amt": "360,000원", "pnum": "3", "type": "curtain", "price": 120000, "space": "서재", "hemType": "5cm", "openType": "양개형", "pleatType": "나비주름형", "displayName": "[입구 좌] 린넨룩 아이보리 속커튼", "heightAdjust": "-3"}, {"mh": "249", "mw": "268", "amt": "297,000원", "pnum": "3", "type": "curtain", "price": 99000, "space": "기타", "hemType": "8cm", "openType": "양개형", "pleatType": "민자형", "displayName": "[입구 우]  팝콘 연베이지 커튼", "heightAdjust": "-3"}, {"amt": "316,000원", "bmh": "245", "bmw": "160", "kind": "롤스크린", "type": "blind", "extra": 0, "price": 79000, "space": "기타", "handle": "좌손", "displayName": "[알파룸] 썬스크린 메탈 3% 크림"}, {"amt": "112,200원", "bmh": "135", "bmw": "119", "kind": "알루미늄", "type": "blind", "extra": 0, "price": 66000, "space": "주방", "handle": "우손", "displayName": "알루미늄 블라인드 크림색 (274번)"}], "cust_type": "new", "confirmed_at": "2026-09-01T00:00:00Z", "deposit_date": "2026-09-04", "install_date_tbd": false, "measure_date_tbd": false}];
const coupons=[{id:'c1',name:'당일결제',type:'pct',value:5},{id:'c2',name:'마케팅',type:'pct',value:3},{id:'c3',name:'입주',type:'pct',value:10}];
const yu=baseRows.find(r=>r.customer_name==='유경진'), park=baseRows.find(r=>r.customer_name==='박윤아');
const T='2026-10-01T00:00:00+00:00';
const cases=[
 {label:'유경진(계약금 있음·금액 같음)', row:Object.assign({},yu,{updated_at:T}), expectWrite:true},
 {label:'박윤아(금액 다름)', row:Object.assign({},park,{updated_at:T}), expectWrite:false},
 {label:'이미 고정된 견적', row:Object.assign({},yu,{id:'11111111-1111-1111-1111-111111111111',updated_at:T,price_breakdown:Object.assign({},yu.price_breakdown,{svcRowsSaved:true})}), expectWrite:false},
 {label:'계약금 없는 가견적', row:Object.assign({},yu,{id:'22222222-2222-2222-2222-222222222222',updated_at:T,deposit_amount:0,estimate_status:'ga'}), expectWrite:false}
];
(async()=>{
 const dir=path.resolve(__dirname,'..'); const port=9961;
 const server=await startServer(dir,port); const browser=await launchBrowser();
 const log=[]; function ok(l,c,d){log.push((c?'✅ ':'❌ ')+l+(d?' — '+d:''));}
 for(const cs of cases){
  const row=cs.row;
  const page=await browser.newPage(); const errs=[]; const writes=[];
  page.on('pageerror',e=>errs.push(e.message));
  page.on('dialog',async d=>{ await d.dismiss(); });
  await page.setRequestInterception(true);
  page.on('request',req=>{const u=req.url();
   if(u.includes('supabase.co')){const h={'Access-Control-Allow-Origin':'*'};
    if(req.method()==='OPTIONS'){req.respond({status:204,headers:{...h,'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'*'}});return;}
    if((req.method()==='PATCH'||req.method()==='POST')&&u.includes('/estimates')){ writes.push({m:req.method(),u:u,b:req.postData()});
      if(req.method()==='PATCH'){req.respond({status:200,contentType:'application/json',headers:h,body:JSON.stringify([Object.assign({},row,{updated_at:'2026-10-02T00:00:00+00:00'})])});return;} }
    if(u.includes('/estimates?id=eq.'+row.id)&&req.method()==='GET'){req.respond({status:200,contentType:'application/json',headers:h,body:JSON.stringify([row])});return;}
    if(u.includes('discount_coupons')){req.respond({status:200,contentType:'application/json',headers:h,body:JSON.stringify([{value:coupons}])});return;}
    req.respond({status:200,contentType:'application/json',headers:h,body:'[]'});return;}
   if(u.startsWith('http://localhost')||u.startsWith('http://127.0.0.1'))req.continue();else req.abort();});
  await page.setViewport({width:1280,height:1400});
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=${row.id}&mode=edit`,{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,1500)); await loginAs(page,'master'); await setupValidSession(page); await new Promise(r=>setTimeout(r,16000));
  const fz=writes.filter(w=>w.m==='PATCH');
  if(cs.expectWrite){
   ok(cs.label+': 자동 고정 저장 1회', fz.length===1, String(fz.length));
   if(fz.length===1){
    const b=JSON.parse(fz[0].b);
    ok(cs.label+': 보내는 항목은 line_items·price_breakdown뿐(금액 컬럼 안 건드림)', Object.keys(b).sort().join()==='line_items,price_breakdown', Object.keys(b).join());
    ok(cs.label+': 표식 svcRowsSaved=true', b.price_breakdown.svcRowsSaved===true);
    ok(cs.label+': 기존 금액 스냅샷(finalTotal·deposit) 그대로', b.price_breakdown.finalTotal===row.price_breakdown.finalTotal && b.price_breakdown.deposit===row.price_breakdown.deposit);
    ok(cs.label+': 행이 저장됨(원래 행 수 이상)', Array.isArray(b.line_items) && b.line_items.length>=row.line_items.length, String(b.line_items&&b.line_items.length));
    ok(cs.label+': 열었을 때 updated_at 조건으로 저장(동시수정 보호)', fz[0].u.indexOf('updated_at=eq.')>=0);
   }
  } else {
   ok(cs.label+': 서버에 쓰지 않음', writes.length===0, JSON.stringify(writes.map(w=>w.m)));
  }
  ok(cs.label+': JS 에러 없음', errs.length===0, errs[0]);
  await page.close();
 }
 log.forEach(l=>console.log(l));
 const failed=log.filter(l=>l.startsWith('❌'));
 console.log(failed.length?'\n실패 '+failed.length+'건':'\n전체 통과');
 await browser.close(); server.kill(); process.exit(failed.length?1:0);
})();
setTimeout(()=>process.exit(1),200000);
