// 2026-10-09 박윤아 사례: 예전 형식으로 저장된 견적서(직접수정한 옵션추가금 행)를 열 때 옵션추가금 행이 자동+저장 2번 들어가 총액이 부풀던 문제
// 최금희 실사례(선금 750,000/총액 2,985,000): 인쇄 화면 계약금·잔금이 서로 맞고 "50%" 고정라벨이 없어야 함
const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession } = require('./_helpers');

const rows=[{"id": "38f4dfda-82be-4697-81ad-97520a1327d6", "customer_name": "박윤아", "price": 1361000, "deposit_amount": 100000, "balance_amount": 1261000, "date": "2026-09-28", "client_id": 216, "branch": "반포점", "region": "서울", "phone": "010-2561-5776", "space": "거실", "install_date": "2026-10-13", "estimate_status": "final", "price_breakdown": {"balance": 1261000, "deposit": 100000, "discount": 92400, "finalTotal": 1361000, "discountDetail": [{"label": "당일결제 5%", "amount": 58300}, {"label": "마케팅 3%", "amount": 33231}, {"label": "끝자리 절사", "amount": 869}], "installSubtotal": 287400, "productSubtotal": 1166000, "performanceRevenue": 1073600}, "applied_discounts": {"manual": null, "coupons": [{"id": "c1", "name": "당일결제", "type": "pct", "value": 5, "amount": 58300}, {"id": "c2", "name": "마케팅", "type": "pct", "value": 3, "amount": 33231}]}, "line_items": [{"mh": "262", "mw": "386", "amt": "726,000원", "pnum": "6", "type": "curtain", "price": 121000, "space": "거실", "vendor": "예원", "hemType": "5cm", "openType": "편개형", "pleatType": "나비주름형", "railVendor": "목성", "displayName": "린 arco 5826-14", "heightAdjust": "-3", "shapeProcess": true}, {"amt": "100,000원", "bmh": "85", "bmw": "178", "opt": "D자형 이지블라인드/하단감쌈", "kind": "롤스크린", "type": "blind", "extra": 35000, "price": 50000, "space": "안방", "handle": "노코드", "displayName": "Amalfi RM-02 아이보리"}, {"amt": "100,000원", "bmh": "85", "bmw": "57", "opt": "D자형 이지블라인드/하단감쌈", "kind": "롤스크린", "type": "blind", "extra": 35000, "price": 50000, "space": "안방", "handle": "노코드", "displayName": "Amalfi RM-02 아이보리"}, {"amt": "140,000원", "bmh": "175", "bmw": "158", "opt": "노코드 /하단감쌈", "kind": "롤스크린", "type": "blind", "extra": 48000, "price": 50000, "space": "자녀방", "handle": "노코드", "displayName": "Amalfi RM-02 아이보리"}, {"amt": "100,000원", "bmh": "175", "bmw": "76", "opt": "노코드/하단감쌈", "kind": "롤스크린", "type": "blind", "extra": 48000, "price": 50000, "space": "자녀방", "handle": "노코드", "displayName": "Amalfi RM-02 아이보리"}, {"qty": "1", "kind": "전동", "type": "svc", "price": 160000, "content": "D자형 이지블라인드/하단감쌈, 노코드 /하단감쌈, 노코드/하단감쌈 ✏️직접수정", "autoType": "option"}], "cust_type": "new", "confirmed_at": "2026-09-01T00:00:00Z", "deposit_date": "2026-09-04", "install_date_tbd": false, "measure_date_tbd": false}];
const coupons=[{id:'c1',name:'당일결제',type:'pct',value:5},{id:'c2',name:'마케팅',type:'pct',value:3},{id:'c3',name:'입주',type:'pct',value:10}];
(async()=>{
 const dir=path.resolve(__dirname,'..'); const port=9957;
 const server=await startServer(dir,port); const browser=await launchBrowser();
 let allOk=true;
 for(const row of rows){
  const page=await browser.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('dialog',async d=>{try{await d.accept()}catch(e){}});
  await page.setRequestInterception(true);
  page.on('request',req=>{const u=req.url();
   if(u.includes('supabase.co')){const h={'Access-Control-Allow-Origin':'*'};
    if(req.method()==='OPTIONS'){req.respond({status:204,headers:{...h,'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'*'}});return;}
    if(u.includes('/estimates?id=eq.'+row.id)){req.respond({status:200,contentType:'application/json',headers:h,body:JSON.stringify([row])});return;}
    if(u.includes('discount_coupons')){req.respond({status:200,contentType:'application/json',headers:h,body:JSON.stringify([{value:coupons}])});return;}
    req.respond({status:200,contentType:'application/json',headers:h,body:'[]'});return;}
   if(u.startsWith('http://localhost')||u.startsWith('http://127.0.0.1'))req.continue();else req.abort();});
  await page.setViewport({width:1280,height:1400});
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=${row.id}&mode=edit`,{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,1500)); await loginAs(page,'master'); await setupValidSession(page); await new Promise(r=>setTimeout(r,9000));
  const r=await page.evaluate(()=>{
   const opts=[...document.querySelectorAll('#svc-body tr')].filter(t=>(t.querySelector('.svc-kind')||{}).value==='전동').map(t=>({content:(t.querySelector('.svc-content')||{}).value,price:(t.querySelector('.sprice')||{}).value}));
   return {opts};});
  const ok = r.opts.length===1 && r.opts[0].price==='160,000' && errs.length===0;
  console.log((ok?'OK  ':'FAIL')+' 박윤아 옵션추가금 행 '+r.opts.length+'개(1개여야 함), 금액 '+JSON.stringify(r.opts.map(o=>o.price))+(errs.length?' ERR '+errs[0]:''));
  allOk=allOk&&ok; await page.close();
 }
 await browser.close(); server.kill(); process.exit(allOk?0:1);
})();
setTimeout(()=>process.exit(1),120000);
