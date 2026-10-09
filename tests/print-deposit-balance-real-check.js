// 최금희 실사례(선금 750,000/총액 2,985,000): 인쇄 화면 계약금·잔금이 서로 맞고 "50%" 고정라벨이 없어야 함
const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession } = require('./_helpers');
const li=[{mh:"264",mw:"548",amt:"1,665,000원",pnum:"9",type:"curtain",color:"",price:185000,space:"거실",fabric:"",vendor:"",hemType:"리드",yardage:"",openType:"양개형",pleatType:"나비주름형",railVendor:"",displayName:"이븐 아이보리 겉커튼",heightAdjust:"-3",shapeProcess:true,fabricUnitPrice:""},{mh:"264",mw:"175",amt:"330,000원",pnum:"2",type:"curtain",color:"",price:165000,space:"안방",fabric:"",vendor:"",hemType:"8cm",yardage:"",openType:"양개형",pleatType:"민자형",railVendor:"",displayName:"라떼 크림 암막커튼 ",heightAdjust:"-3",shapeProcess:true,fabricUnitPrice:""},{mh:"264",mw:"263",amt:"375,000원",pnum:"3",type:"curtain",color:"",price:125000,space:"안방옆방",fabric:"",vendor:"",hemType:"8cm",yardage:"",openType:"양개형",pleatType:"민자형",railVendor:"",displayName:"굿나잇 아이보리 암막커튼 ",heightAdjust:"-3",shapeProcess:true,fabricUnitPrice:""},{mh:"264",mw:"275",amt:"297,000원",pnum:"3",type:"curtain",color:"",price:99000,space:"입구 우방",fabric:"",vendor:"",hemType:"8cm",yardage:"",openType:"양개형",pleatType:"민자형",railVendor:"",displayName:"에센셜 그레이지 암막커튼 ",heightAdjust:"-3",shapeProcess:true,fabricUnitPrice:""},{amt:"346,500원",bmh:"264",bmw:"170",opt:"",kind:"우드",type:"blind",color:"",extra:0,price:77000,space:"입구 좌방",fabric:"",handle:"우손",vendor:"",comment:"",bottomBar:"",cordLength:"",displayName:"우드 블라인드 (seal brown)"}];
const row={id:"94d6c29a-f770-4d63-8386-6969b97d8307",date:"2026-09-22",memo:"",phone:"010-9981-5106",price:2985000,space:"거실, 안방",branch:"반포점",region:"서울",client_id:221,cust_type:"new",line_items:li,staff_name:"마스터",balance_date:"2026-09-23",confirmed_at:"2026-09-22T21:52:32Z",deposit_date:"2026-09-22",install_date:"2026-10-02",customer_name:"최금희",balance_amount:2235000,balance_method:"현금",deposit_amount:750000,deposit_method:"현금",balance_receipt:true,deposit_receipt:true,estimate_status:"final",price_breakdown:{balance:2235000,deposit:750000,discount:302100,finalTotal:2985000,discountDetail:[{label:"입주 10%",amount:301350},{label:"끝자리 절사",amount:750}],installSubtotal:273600,productSubtotal:3013500,performanceRevenue:2711400},install_date_tbd:false,measure_date_tbd:false,applied_discounts:{manual:null,coupons:[{id:"c3",name:"입주",type:"pct",value:10,amount:301350}]},performance_revenue:2711400};
(async()=>{
 const dir=path.resolve(__dirname,'..'); const port=9953;
 const server=await startServer(dir,port); const browser=await launchBrowser(); const page=await browser.newPage();
 const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('dialog',async d=>{try{await d.accept()}catch(e){}});
 await page.setRequestInterception(true);
 page.on('request',req=>{const u=req.url();
  if(u.includes('supabase.co')){
   const h={'Access-Control-Allow-Origin':'*'};
   if(req.method()==='OPTIONS'){req.respond({status:204,headers:{...h,'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'*'}});return;}
   if(u.includes('/estimates?id=eq.'+row.id)){req.respond({status:200,contentType:'application/json',headers:h,body:JSON.stringify([row])});return;}
   if(u.includes('discount_coupons')){req.respond({status:200,contentType:'application/json',headers:h,body:JSON.stringify([{value:[{id:'c3',name:'입주',type:'pct',value:10}]}])});return;}
   req.respond({status:200,contentType:'application/json',headers:h,body:'[]'});return;}
  if(u.startsWith('http://localhost')||u.startsWith('http://127.0.0.1'))req.continue();else req.abort();});
 await page.setViewport({width:1280,height:1400});
 await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=${row.id}&mode=edit`,{waitUntil:'domcontentloaded',timeout:15000});
 await new Promise(r=>setTimeout(r,1500)); await loginAs(page,'master'); await setupValidSession(page); await new Promise(r=>setTimeout(r,9000));
 const r=await page.evaluate(()=>{const d=document.getElementById('deposit-input');
  const html=buildCustomerHTML(); const t=document.createElement('div'); t.innerHTML=html;
  const items=[...t.querySelectorAll('.pv-payment-item')].map(x=>x.textContent.replace(/\s+/g,' ').trim());
  return {input:d&&d.value,raw:d&&d.dataset.raw,src:d&&d.dataset.depositSource,total:document.getElementById('sum-total').textContent,items,
   sumBal:document.getElementById('sum-balance').textContent,coupChecked:[...document.querySelectorAll('#coupon-list input:checked')].length,sumBalDisp:(document.getElementById('sum-balance-disp')||{}).textContent,sumDepDisp:(document.getElementById('sum-deposit-disp')||{}).textContent};});
 console.log(JSON.stringify(r,null,1)); console.log('JS errors:',errs);
 const okAll = r.total.indexOf('2,985,000')>=0 && /750,000원$/.test(r.items[0]) && /2,235,000원$/.test(r.items[1]) && r.items[0].indexOf('50%')<0 && errs.length===0;
 console.log(okAll?'전체 통과':'실패'); await browser.close(); server.kill(); process.exit(okAll?0:1);
 })();
setTimeout(()=>process.exit(1),40000);
