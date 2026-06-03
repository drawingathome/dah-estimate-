import React, { useState, useCallback, useRef, useEffect } from "react";

const LOGO = "data:image/webp;base64,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";
const LOGO_SERIF = "data:image/webp;base64,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";
const C = {
  dark:"#1A1A1A",
  mid:"#6B6B6B",
  light:"#A8A8A8",
  border:"#E5E0D8",
  orange:"#D4622A",
  ivory:"#FEFCF9",
  ivory2:"#F5F1EC",
  warn:"#b45309",
  danger:"#d94f4f",
  ok:"#16a34a",
};
const FONT = "'Noto Sans KR','Apple SD Gothic Neo',sans-serif";
const SPACES = ["거실","안방","아이방","서재","옷방","다용도실","기타"];
const BLIND_TYPES = ["롤블라인드","알루미늄 블라인드","로만쉐이드","허니콤 블라인드","우드블라인드","직접입력"];
const BLIND_MIN = {"롤블라인드":2.0,"알루미늄 블라인드":1.5,"로만쉐이드":2.0,"허니콤 블라인드":1.5,"우드블라인드":1.5};
const fmt = n => "₩ " + Math.round(n).toLocaleString();

// 유선전화(02) 지원
const fmtPhone = v => {
  const d = v.replace(/\D/g,'');
  if(d.startsWith('02')) {
    if(d.length<=2) return d;
    if(d.length<=6) return d.slice(0,2)+'-'+d.slice(2);
    if(d.length<=9) return d.slice(0,2)+'-'+d.slice(2,5)+'-'+d.slice(5);
    return d.slice(0,2)+'-'+d.slice(2,6)+'-'+d.slice(6,10);
  }
  if(d.length<=3) return d;
  if(d.length<=7) return d.slice(0,3)+'-'+d.slice(3);
  return d.slice(0,3)+'-'+d.slice(3,7)+'-'+d.slice(7,11);
};
const calcQty = (w, pleat) => {
  if(!w) return null;
  if(!pleat) return null;
  const ratio = pleat==="나비주름형"?2.0:pleat==="민자형"?1.5:2.0;
  const qty = Math.ceil(Number(w)*ratio/130);
  return {qty: Math.max(1,qty), ratio};
};

const calcRail = (w) => {
  if(!w) return null;
  const raw = Math.ceil(Number(w)/30);
  const ja = raw%2===0?raw:raw+1;
  return {ja, price: ja*(window.__dah_railPrice||1600)};
};
const calcArea = (w, h, bType) => {
  if(!w||!h) return null;
  const ow=Number(w), oh=Number(h);
  const raw = Math.ceil(ow*oh/1000)/10;
  const min = BLIND_MIN[bType]||2.0;
  return {ow,oh,area:Math.max(raw,min), minApplied:raw<min};
};
const newItem = id => ({
  id, type:"curtain", room:"", product:"",
  w:"", h:"",
  blindType:"", pleat:"", openType:"", hem:"",
  installType:"시공의뢰", handlePos:"",
  qtyAuto:true, qty:"", price:"",
  option:"", optionPrice:"", manualTotal:"",
  rail:false, reason:"",  vendorCode:"", vendor:"", neededYards:"", hActual:"",  fabricProcess:"",  cordLength:"", bottomBar:"", system:"",
});
const iSt = {width:"100%",padding:"10px 12px",border:`1px solid ${C.border}`,borderRadius:4,fontSize:13,color:C.dark,background:"#fff",boxSizing:"border-box",fontFamily:FONT,outline:"none",transition:"border-color 0.15s"};
const sSt = {...iSt,appearance:"none",WebkitAppearance:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23777'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center",backgroundSize:"10px"};

function F({label,hint,children}) {
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontSize:11,color:C.mid,fontWeight:700,letterSpacing:0.3}}>{label}</span>
        {hint&&<span style={{fontSize:11,color:C.orange}}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
function StepBar({step, maxStep, labels}) {
  return (
    <div style={{padding:"14px 20px 0",background:"#fff"}}>
      <div style={{display:"flex",alignItems:"center",marginBottom:8}}>
        {labels.map((l,i) => (
          <React.Fragment key={i}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:0,flex:1}}>
              <div style={{
                width:24,height:24,borderRadius:"50%",
                background: i+1<step?C.orange: i+1===step?"#fff":"#fff",
                border: i+1<=step?`2px solid ${C.orange}`:`2px solid ${C.border}`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:11,fontWeight:700,
                color: i+1<step?"#fff": i+1===step?C.orange:C.light,
                transition:"all 0.2s",
              }}>
                {i+1<step?"✓":i+1}
              </div>
              <div style={{fontSize:11,color:i+1===step?C.orange:C.light,marginTop:4,whiteSpace:"nowrap"}}>{l}</div>
            </div>
            {i<labels.length-1&&<div style={{flex:1,height:1,background:i+1<step?C.orange:C.border,margin:"0 2px",marginBottom:16,transition:"background 0.2s"}}/>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
function ItemCard({item, onChange, onRemove, onAddSame, onCopy, isFinal}) {
  const isCurtain = item.type==="curtain";
  const qC = isCurtain&&item.qtyAuto ? calcQty(item.w, item.pleat) : null;
  const rC = isCurtain&&item.rail ? calcRail(item.w) : null;
  const aC = !isCurtain ? calcArea(item.w,item.h,item.blindType) : null;
  return (
    <div style={{overflow:"hidden",background:"#fff",marginBottom:8}}>
      {/* 헤더: ✕만 남김 */}
      <div style={{background:C.ivory2,padding:"10px 14px 10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,borderBottom:`1px solid ${C.border}`,borderLeft:`3px solid ${C.orange}`}}>
        <span style={{fontSize:11,fontWeight:700,color:C.dark,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.room||"공간 미선택"}</span>
        <div style={{display:"flex",gap:4,flexShrink:0,alignItems:"center"}}>
          {[["curtain","커튼"],["blind","블라인드"]].map(([v,l])=>(
            <button key={v} onClick={()=>onChange("type",v)} style={{fontSize:11,padding:"4px 8px",border:`1px solid ${item.type===v?C.orange:C.border}`,borderRadius:4,background:item.type===v?C.orange:"#fff",color:item.type===v?"#fff":C.dark,cursor:"pointer",transition:"all 0.15s"}}>{l}</button>
          ))}
          <button onClick={onRemove} style={{fontSize:11,padding:"4px 8px",border:"1px solid #f0b8b8",borderRadius:4,background:"#fff",color:C.danger,cursor:"pointer",fontWeight:700}}>✕</button>
        </div>
      </div>

      <div style={{padding:12}}>
        <div style={{display:"grid",gridTemplateColumns:"100px 1fr",gap:8,marginBottom:8}}>
          <F label="공간">
            <select style={sSt} value={item.room} onChange={e=>onChange("room",e.target.value)}>
              <option value="">선택</option>
              {(window.__dah_spaces||SPACES).map(s=><option key={s}>{s}</option>)}
            </select>
          </F>
          <F label="제품명+색상">
            <input style={iSt} value={item.product} placeholder="예) 린넨 쉬어 아이보리" onChange={e=>onChange("product",e.target.value)}/>
          </F>
        </div>

        {isCurtain?(
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <F label="실측 가로 (cm)">
                <input style={iSt} type="number" value={item.w} placeholder="실측 가로" onChange={e=>onChange("w",e.target.value)}/>
              </F>
              <F label="실측 세로 (cm)">
                <input style={{...iSt,borderColor:Number(item.h)>243?C.danger:undefined}} type="number" value={item.h} placeholder="최대 243cm" onChange={e=>onChange("h",e.target.value)}/>
                {Number(item.h)>243&&(
                  <div style={{fontSize:11,color:C.danger,marginTop:4,lineHeight:1.6}}>
                    ⚠ 243cm 초과 — 추가금액 발생. 수기 금액으로 입력하세요.
                  </div>
                )}
              </F>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <F label="주름/형태">
                <select style={sSt} value={item.pleat} onChange={e=>onChange("pleat",e.target.value)}>
                  <option value="">선택</option>
                  <option>민자형</option><option>나비주름형</option>
                </select>
              </F>
              <F label="폭수" hint={item.qtyAuto?"자동계산 (주름×폭÷130)":"수동 입력"}>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  <label style={{fontSize:11,color:C.dark,display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>
                    <input type="checkbox" checked={item.qtyAuto} onChange={e=>onChange("qtyAuto",e.target.checked)}/>자동
                  </label>
                  <input style={{...iSt,background:item.qtyAuto&&qC?C.ivory:"#fff",fontWeight:item.qtyAuto&&qC?700:400}} type="number" value={item.qtyAuto&&qC?qC.qty:item.qty} placeholder="폭수" readOnly={item.qtyAuto&&!!qC} onChange={e=>onChange("qty",e.target.value)}/>
                </div>
                {/* Fix8: 주름 미선택 경고 */}
                {isCurtain&&item.qtyAuto&&!item.pleat&&(
                  <div style={{fontSize:11,color:C.orange,marginTop:4,display:"flex",alignItems:"center",gap:4}}>
                    <span>⚠</span><span>주름/형태를 선택해야 폭수가 자동 계산됩니다</span>
                  </div>
                )}
              </F>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <F label="개폐방식">
                <select style={sSt} value={item.openType||""} onChange={e=>onChange("openType",e.target.value)}>
                  <option value="">선택</option>
                  <option>양개형</option><option>편개형</option>
                </select>
              </F>
              <F label="하단방식">
                <select style={sSt} value={item.hem||""} onChange={e=>onChange("hem",e.target.value)}>
                  <option value="">선택</option>
                  <option>리드밴드</option><option>5cm 시접</option><option>8cm 시접</option>
                </select>
                {item.hem==="리드밴드"&&(
                  <div style={{fontSize:11,color:C.warn,marginTop:4,lineHeight:1.6}}>
                    ⚠ 리드밴드 가능한 원단은 별도 확인해야 합니다.
                  </div>
                )}
              </F>
            </div>
          </>
        ):(
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <F label="실측 가로 (cm)">
                <input style={iSt} type="number" value={item.w} placeholder="실측 가로" onChange={e=>onChange("w",e.target.value)}/>
              </F>
              <F label="실측 세로 (cm)">
                <input style={iSt} type="number" value={item.h} placeholder="실측 세로" onChange={e=>onChange("h",e.target.value)}/>
              </F>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <F label="블라인드 종류">
              <select style={sSt} value={item.blindType||""} onChange={e=>onChange("blindType",e.target.value)}>
                <option value="">선택</option>
                {BLIND_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
              {item.blindType==="직접입력"&&<input style={{...iSt,marginTop:4}} value={item.blindTypeCustom||""} placeholder="직접 입력" onChange={e=>onChange("blindTypeCustom",e.target.value)}/>}
              {aC&&item.blindType&&item.blindType!=="직접입력"&&<div style={{fontSize:11,color:C.dark,marginTop:4}}>{aC.area}㎡{aC.minApplied?" (최솟값)":""}</div>}
            </F>
            <F label="손잡이 위치">
              <select style={sSt} value={item.handlePos||""} onChange={e=>onChange("handlePos",e.target.value)}>
                <option value="">선택</option><option>왼쪽</option><option>오른쪽</option>
              </select>
            </F>
          </div>
          </>
        )}

        {(()=>{
          const autoAmt = isCurtain
            ? (qC?.qty||Number(item.qty)||0)*(Number(item.price)||0)
            : (aC?.area||0)*(Number(item.price)||0);
          const dispAmt = Number(item.manualTotal)>0 ? Number(item.manualTotal) : autoAmt;
          return (
            <div style={{marginBottom:8}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:4}}>
                <F label={isCurtain?"단가 (원/폭)":"단가 (원/㎡)"} hint={Number(item.manualTotal)>0?"수기금액 적용중":isCurtain?"폭수×단가 자동합산":"면적×단가 자동합산"}>
                  <input style={{...iSt,opacity:Number(item.manualTotal)>0?0.35:1,pointerEvents:Number(item.manualTotal)>0?"none":"auto"}}
                    type="number" value={item.price} placeholder="0"
                    onChange={e=>{onChange("price",e.target.value); if(e.target.value) onChange("manualTotal","");}}/>
                </F>
                <F label="수기 금액 (원)" hint={item.price&&!item.manualTotal?"단가 우선":"패키지·특가 적용 시 직접 입력"}>
                  <input style={{...iSt,background:Number(item.manualTotal)>0?C.ivory:"#fff",opacity:item.price&&!Number(item.manualTotal)?0.45:1}}
                    type="number" value={item.manualTotal||""} placeholder="금액 직접 입력"
                    onChange={e=>{onChange("manualTotal",e.target.value); if(e.target.value) onChange("price","");}}/>
                </F>
              </div>
              {dispAmt>0&&(
                <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:6,padding:"6px 10px",background:C.ivory}}>
                  <span style={{fontSize:11,color:C.mid}}>{Number(item.manualTotal)>0?"수기금액":isCurtain?`${qC?.qty||item.qty||0}폭 × ₩${Number(item.price||0).toLocaleString()}`:`${aC?.area||0}㎡ × ₩${Number(item.price||0).toLocaleString()}`}</span>
                  <span style={{fontSize:13,fontWeight:700,color:C.orange}}>{fmt(dispAmt)}</span>
                </div>
              )}
            </div>
          );
        })()}

        {isCurtain&&(
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
            <label style={{fontSize:11,color:C.dark,display:"flex",alignItems:"center",gap:4}}>
              <input type="checkbox" checked={item.rail} onChange={e=>onChange("rail",e.target.checked)}/>레일 포함
            </label>
            <span style={{fontSize:11,color:C.mid}}>(새 레일 설치 시 체크 — {(window.__dah_railPrice||1600).toLocaleString()}원/자)</span>
            {item.rail&&rC&&<span style={{fontSize:11,color:C.dark}}>{rC.ja}자 → {fmt(rC.price)}</span>}
          </div>
        )}

        {/* 시공 방법 */}
        <div style={{fontSize:11,color:C.mid,marginBottom:4}}>시공 방법 — 시공의뢰: 드로잉엣홈이 시공 · 셀프시공: 고객 직접 설치 (시공비 없음)</div>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          {["시공의뢰","셀프시공"].map(t=>(
            <button key={t} onClick={()=>onChange("installType",t)} style={{flex:1,padding:"8px 0",fontSize:11,border:`1px solid ${item.installType===t?C.orange:C.border}`,borderRadius:4,background:item.installType===t?C.orange:"#fff",color:item.installType===t?"#fff":C.mid,cursor:"pointer",fontWeight:700,transition:"all 0.15s"}}>{t}</button>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <F label="옵션" hint="추가 부자재·특수기능">
            <input style={iSt} value={item.option||""} placeholder="예) 모터, 이중블라인드, 차광라이너, 봉" onChange={e=>onChange("option",e.target.value)}/>
          </F>
          <F label="옵션 금액 (원)">
            <input style={iSt} type="number" value={item.optionPrice||""} placeholder="0" onChange={e=>onChange("optionPrice",e.target.value)}/>
          </F>
        </div>
        {/* 내부용 — 품번·거래처·마수 (최종견적서) */}
        {isFinal&&(()=>{
          const qty = isCurtain&&item.qtyAuto&&qC ? qC.qty : Number(item.qty)||0;
          const autoYards = isCurtain&&item.h&&qty
            ? Math.ceil((Number(item.h)+20)/91*qty*10)/10 : null;
          const orderSize = !isCurtain&&item.w&&item.h ? `W${item.w} × H${item.h} cm` : null;
          return (
            <div style={{marginTop:8,padding:"10px 12px",background:C.ivory2,borderRadius:4,border:"1.5px solid #f59e42",marginBottom:8}}>
              <div style={{fontSize:11,color:C.warn,fontWeight:700,marginBottom:8}}>📦 내부 발주 정보</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <F label="업체 품번">
                  <input style={iSt} value={item.vendorCode||""} placeholder="예) L-2301" onChange={e=>onChange("vendorCode",e.target.value)}/>
                </F>
                <F label="담당 거래처">
                  <input style={iSt} value={item.vendor||""} placeholder="예) A원단사" onChange={e=>onChange("vendor",e.target.value)}/>
                </F>
                {isCurtain?(
                  <F label="형상 가공">
                    <input style={iSt} value={item.fabricProcess||""} placeholder="예) 봉주름, 반주름, 없음" onChange={e=>onChange("fabricProcess",e.target.value)}/>
                  </F>
                ):null}
                {!isCurtain&&(
                  <>
                    <F label="끈 길이">
                      <input style={iSt} value={item.cordLength||""} placeholder="예) 150cm, 짧게" onChange={e=>onChange("cordLength",e.target.value)}/>
                    </F>
                    <F label="하단 바">
                      <input style={iSt} value={item.bottomBar||""} placeholder="예) 일반, 웨이트, 없음" onChange={e=>onChange("bottomBar",e.target.value)}/>
                    </F>
                    <F label="시스템">
                      <input style={iSt} value={item.system||""} placeholder="예) 체인, 스프링, 모터" onChange={e=>onChange("system",e.target.value)}/>
                    </F>
                  </>
                )}
                {isCurtain?(
                  <F label="필요 마수" hint={autoYards?`자동계산: ${autoYards}마 ((세로+20)÷91×폭수)`:"가로·세로·폭수 입력 후 자동계산"}>
                    <div style={{display:"flex",gap:4,alignItems:"center"}}>
                      <input style={{...iSt,background:autoYards?C.ivory2:"#fff",fontWeight:autoYards?700:400}} type="number"
                        value={item.neededYards||(autoYards||"")}
                        placeholder={autoYards?String(autoYards):"마"}
                        onChange={e=>onChange("neededYards",e.target.value)}/>
                      {autoYards&&<span style={{fontSize:11,color:C.ok,whiteSpace:"nowrap"}}>{autoYards}마</span>}
                    </div>
                  </F>
                ):(
                  <F label="발주 사이즈" hint="자동계산">
                    <input style={{...iSt,background:orderSize?C.ivory2:"#fff",color:orderSize?C.ok:"inherit"}} value={orderSize||""} readOnly placeholder="가로·세로 입력 후"/>
                  </F>
                )}
              </div>
            </div>
          );
        })()}

        {/* Fix7: 하단 버튼 */}
        <div style={{display:"flex",gap:6,paddingTop:8,marginTop:4,borderTop:`0.5px solid ${C.border}`}}>
          <button onClick={()=>onAddSame(item.room)} style={{flex:1,fontSize:11,padding:"7px 0",border:`1px solid ${C.border}`,borderRadius:4,background:"#fff",color:C.dark,cursor:"pointer"}}>+ 같은 공간 추가</button>
          <button onClick={onCopy} style={{flex:1,fontSize:11,padding:"7px 0",border:`1px solid ${C.border}`,borderRadius:4,background:"#fff",color:C.mid,cursor:"pointer"}}>복사</button>
        </div>
      </div>
    </div>
  );
}
const SH = ({label}) => (
  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
    <span style={{fontSize:11,color:C.dark,fontWeight:700}}>{label}</span>
    <div style={{flex:1,height:1,background:C.border}}/>
  </div>
);

function Rx({form, pItems, upItem}) {
  const today = new Date();
  const ds = `${today.getFullYear()}. ${String(today.getMonth()+1).padStart(2,"0")}. ${String(today.getDate()).padStart(2,"0")}`;
  return (
    <div ref={null} style={{background:"#fff",fontFamily:FONT,color:C.dark,position:"relative",overflow:"hidden"}}>
      
      <div style={{position:"relative",zIndex:1}}>
        <div style={{height:3,background:C.orange}}/>
        <div style={{padding:"28px 36px 20px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:11,color:C.mid,letterSpacing:1.2,marginBottom:8}}>공간 처방전</div>
            <div style={{fontSize:13,fontWeight:700,color:C.dark}}>{form.clientName||"고객명"}</div>
            <div style={{fontSize:11,color:C.light,marginTop:2}}>{ds}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <img src={LOGO_SERIF} alt="DRAWING at HOME" style={{height:40,display:"block"}}/>
          </div>
        </div>

        <div style={{padding:"0 36px 20px"}}>
          {form.diagnosis&&(
            <div style={{marginBottom:24,padding:"14px 18px",background:C.ivory,borderRadius:4,borderLeft:`3px solid ${C.orange}`}}>
              <div style={{fontSize:11,color:C.mid,letterSpacing:1.2,marginBottom:8}}>공간 진단</div>
              <div style={{fontSize:13,color:C.dark,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{form.diagnosis}</div>
            </div>
          )}

          {pItems.map((it,i) => it.reason ? (
            <div key={it.id} style={{marginBottom:16,paddingBottom:16,borderBottom:i<pItems.length-1?`0.5px solid ${C.border}`:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{fontSize:11,color:"#fff",background:C.orange,padding:"2px 8px",borderRadius:4,fontWeight:700}}>{it.room||`품목${i+1}`}</div>
                <div style={{fontSize:11,fontWeight:700}}>{it.product}</div>
              </div>
              <div style={{fontSize:13,color:C.mid,lineHeight:1.8}}>{it.reason}</div>
            </div>
          ) : null)}

          {form.rxNote&&(
            <div style={{marginTop:8,padding:"12px 16px",background:C.ivory2}}>
              <div style={{fontSize:11,color:C.mid,letterSpacing:1.2,marginBottom:4}}>메모</div>
              <div style={{fontSize:11,color:C.dark,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{form.rxNote}</div>
            </div>
          )}

          {(form.rxMainRoom||form.rxProduct)&&(
            <div style={{marginTop:16,padding:"16px 20px",background:"#fff",borderRadius:4,border:`1.5px solid ${C.orange}`}}>
              <div style={{fontSize:11,color:C.orange,letterSpacing:1.2,marginBottom:8,fontWeight:700}}>전문가 추천</div>
              {form.rxMainRoom&&<div style={{fontSize:11,color:C.mid,marginBottom:4}}>주력 공간 · <span style={{color:C.dark,fontWeight:700}}>{form.rxMainRoom}</span></div>}
              {form.rxProduct&&<div style={{fontSize:13,fontWeight:700,color:C.dark,marginBottom:8}}>{form.rxProduct}</div>}
              {form.rxReason&&<div style={{fontSize:13,color:C.mid,lineHeight:1.8,marginBottom:8}}>{form.rxReason}</div>}
              {form.rxColor&&<div style={{fontSize:11,color:C.mid}}>컬러 제안 · <span style={{color:C.dark}}>{form.rxColor}</span></div>}
              {form.rxExpert&&<div style={{fontSize:11,color:C.mid,marginTop:8,paddingTop:8,borderTop:`0.5px solid ${C.border}`}}>{form.rxExpert}</div>}
            </div>
          )}
        </div>

        <div style={{padding:"12px 36px",background:C.ivory,borderTop:`0.5px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:11,color:C.light}}>dahcurtain.co.kr</div>
          <div style={{fontSize:11,color:C.light}}>서울 서초구 반포동 · 예약제 쇼룸</div>
        </div>
      </div>
    </div>
  );
}
function Quote({form, pItems, config}) {
  const today = new Date();
  const ds = `${today.getFullYear()}. ${String(today.getMonth()+1).padStart(2,"0")}. ${String(today.getDate()).padStart(2,"0")}`;
  const isEst = form.type==="estimate";
  const hasInstall = pItems.some(it => (it.installType||"시공의뢰") === "시공의뢰");
  const prodSub = pItems.reduce((s,it)=>s+it.total,0);
  const railTotal = pItems.reduce((s,it)=>s+(it.rC?.price||0),0);
  const optTotal = pItems.reduce((s,it)=>s+(Number(it.optionPrice)||0),0);
  const dRate = Number(form.discountRate)||0;
  const dAmt = Number(form.discountAmt)||0;
  const discByRate = dRate>0?Math.round(prodSub*dRate/100):0;
  const disc = Math.min(discByRate+dAmt,prodSub);
  const prodNet = prodSub-disc;
  const railCnt = pItems.filter(it=>it.rC).length;
  const blindCnt = pItems.filter(it=>it.type==="blind").length;
  const regBase = hasInstall?(form.region==="서울"?(config.seoulBase||50000):form.region==="경기"?(config.gyeonggiBase||100000):(Number(form.regionCustom)||0)):0;
  const svcExtra = Number(form.svcExtraPrice)||0;
  const svcTotal = regBase*2+railCnt*(config.railSvc||25000)+blindCnt*(config.blindSvc||10000)+railTotal+optTotal+svcExtra;
  const grand = prodNet+svcTotal;
  const dep = Math.round(grand*(Number(form.depositPct)||50)/100);
  const bal = grand-dep;
  const ROW = {display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"8px 0",borderBottom:`1px solid ${C.border}`};

  return (
    <div style={{background:"#fff",fontFamily:FONT,color:C.dark,position:"relative",overflow:"hidden"}}>
      
      <div style={{position:"relative",zIndex:1}}>
        <div style={{height:4,background:C.orange}}/>
        <div style={{padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",background:"#fff"}}>
          <div style={{display:"flex",gap:16,alignItems:"center"}}>
            <div style={{width:3,height:34,background:C.orange,borderRadius:4,flexShrink:0}}/>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:C.dark,letterSpacing:2,marginBottom:8}}>{isEst?"가 견 적 서":"최 종 견 적 서"}</div>
              <div style={{fontSize:11,color:C.mid,letterSpacing:0.3,whiteSpace:"nowrap"}}>{ds}{isEst?" · 유효 7일":""}</div>
            </div>
          </div>
          <img src={LOGO} alt="DRAWING at HOME" style={{maxWidth:120,height:"auto",opacity:1,flexShrink:0}}/>
        </div>

        <div style={{padding:"16px 22px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:24,padding:"14px 20px",background:C.ivory2}}>
            <div>
              <div style={{fontSize:11,color:C.mid,marginBottom:4}}>고객명</div>
              <div style={{fontSize:13,fontWeight:700}}>{form.clientName||"—"}</div>
              {form.clientPhone&&<div style={{fontSize:11,color:C.mid,marginTop:2}}>{form.clientPhone}</div>}
              {form.clientAddr&&<div style={{fontSize:11,color:C.light,marginTop:0}}>{form.clientAddr}</div>}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:C.mid,marginBottom:4}}>시공 지역</div>
              <div style={{fontSize:11,color:C.dark}}>{form.region==="직접입력"?(form.regionCustom||"—"):form.region||"—"}</div>
              {form.consultDate&&<div style={{fontSize:11,color:C.light,marginTop:4}}>상담 {form.consultDate}</div>}
              {form.measureDate&&<div style={{fontSize:11,color:C.light}}>실측 {form.measureDate}</div>}
            </div>
          </div>

          {/* 품목 */}
          <div style={{marginBottom:16}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 70px 70px 76px",gap:0,borderBottom:`1px solid ${C.dark}`,paddingBottom:6,marginBottom:4}}>
              {["제품","수량","단가","금액"].map(h=><div key={h} style={{fontSize:11,color:C.mid,fontWeight:700,textAlign:h!=="제품"?"right":"left"}}>{h}</div>)}
            </div>
            {(() => {
              const groups = {};
              pItems.forEach(it => { const r=it.room||"기타"; if(!groups[r])groups[r]=[]; groups[r].push(it); });
              return Object.entries(groups).map(([room,its])=>(
                <div key={room} style={{marginBottom:16}}>
                  <div style={{fontSize:11,color:C.orange,fontWeight:700,marginBottom:8,letterSpacing:1.2,textTransform:"uppercase"}}>{room}</div>
                  {its.map(it=>{
                    const qLbl = it.type==="curtain"?`${it.qty||"—"}폭`:it.aC?`${it.aC.area}㎡`:"—";
                    const specs = it.type==="curtain"
                      ? [it.pleat,it.openType,it.hem,it.option].filter(Boolean).join(" · ")
                      : [it.blindType,it.option].filter(Boolean).join(" · ");
                    const sz = it.type==="curtain"&&it.w&&it.h?`${it.w}×${it.h}cm`:it.type==="blind"&&it.w&&it.h?`${it.w}×${it.h}cm`:"";
                    return (
                      <div key={it.id} style={{display:"grid",gridTemplateColumns:"1fr 70px 70px 76px",gap:0,...ROW}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:C.dark,marginBottom:4}}>{it.product||"—"}</div>
                          {specs&&<div style={{fontSize:11,color:C.mid,lineHeight:1.6}}>{specs}</div>}
                          {sz&&<div style={{fontSize:11,color:C.light,marginTop:0}}>{sz}</div>}
                        </div>
                        <div style={{textAlign:"right",fontSize:13,color:C.dark,paddingTop:2}}>{qLbl}</div>
                        <div style={{textAlign:"right",fontSize:13,color:C.dark,paddingTop:2}}>{it.price>0?`${fmt(it.price)}${it.type==="blind"?"/㎡":"/폭"}`:"—"}</div>
                        <div style={{textAlign:"right",paddingTop:2}}>
                          {/* Fix5: manualTotal 조건 */}
                          {(it.price>0&&it.qty>0)||Number(it.manualTotal)>0
                            ?<span style={{fontSize:13,fontWeight:700,color:C.dark}}>{fmt(it.total)}</span>
                            :<span style={{color:C.border}}>—</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>

          {/* 합계 */}
          <div style={{background:"#fff",padding:"12px 0",marginBottom:0,borderTop:`1px solid ${C.border}`}}>
            <div style={ROW}><span style={{fontSize:11,color:C.mid}}>제품 소계</span><span style={{fontSize:13,fontWeight:700}}>{fmt(prodSub)}</span></div>
            {disc>0&&<div style={ROW}><span style={{fontSize:11,color:C.mid}}>할인{dRate>0?` (${dRate}%)`:""}</span><span style={{fontSize:13,color:C.danger}}>- {fmt(disc)}</span></div>}
            {svcTotal>0&&(
              <>
                <div style={ROW}>
                  <span style={{fontSize:11,color:C.mid}}>시공·실측비</span>
                  <span style={{fontSize:13,fontWeight:700}}>{fmt(svcTotal)}</span>
                </div>
                <div style={{paddingLeft:12,paddingBottom:4}}>
                  {hasInstall&&regBase>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.mid,padding:"2px 0"}}><span>실측·시공 ({form.region})</span><span>{fmt(regBase*2)}</span></div>}
                  {railCnt>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.mid,padding:"2px 0"}}><span>레일 시공 ({railCnt}개)</span><span>{fmt(railCnt*(config?.railSvc||25000))}</span></div>}
                  {railTotal>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.mid,padding:"2px 0"}}><span>레일 자재</span><span>{fmt(railTotal)}</span></div>}
                  {blindCnt>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.mid,padding:"2px 0"}}><span>블라인드 시공 ({blindCnt}개)</span><span>{fmt(blindCnt*(config?.blindSvc||10000))}</span></div>}
                  {optTotal>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.mid,padding:"2px 0"}}><span>옵션·부자재</span><span>{fmt(optTotal)}</span></div>}
                  {svcExtra>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.mid,padding:"2px 0"}}><span>{form.svcExtra||"기타"}</span><span>{fmt(svcExtra)}</span></div>}
                </div>
              </>
            )}
            <div style={{...ROW,borderBottom:"none",paddingTop:12,marginTop:4,borderTop:`1px solid ${C.border}`}}>
              <span style={{fontSize:13,fontWeight:700}}>합계</span>
              <span style={{fontSize:15,fontWeight:700,color:C.orange}}>{fmt(grand)}</span>
            </div>
          </div>

          {grand>0&&(
            <div style={{marginBottom:16}}>
              <div style={{display:"grid",gridTemplateColumns:isEst?"1fr":"1fr 1fr",gap:1,background:C.border,borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
                <div style={{padding:"14px 20px",background:"#fff",textAlign:"center"}}>
                  <div style={{fontSize:11,color:C.mid,letterSpacing:1.2,marginBottom:8}}>계약금 ({form.depositPct||50}%)</div>
                  <div style={{fontSize:15,fontWeight:700,color:C.dark}}>{fmt(dep)}</div>
                </div>
                {!isEst&&(
                  <div style={{padding:"14px 20px",background:form.balOverride?C.ivory2:"#fff",textAlign:"center",borderLeft:`1px solid ${C.border}`}}>
                    <div style={{fontSize:11,color:C.mid,letterSpacing:1.2,marginBottom:8}}>잔금{form.balOverride&&<span style={{fontSize:11,color:C.orange,marginLeft:4}}>수정됨</span>}</div>
                    <div style={{fontSize:15,fontWeight:700,color:C.dark}}>{fmt(form.balOverride?Number(form.balOverride):bal)}</div>
                    <div style={{fontSize:11,color:C.mid,marginTop:4}}>잔금 완납 후 시공 확정</div>
                  </div>
                )}
              </div>
              {isEst&&(
                <div style={{marginTop:8,padding:"10px 14px",borderLeft:`2px solid ${C.orange}`,background:C.ivory2}}>
                  <div style={{fontSize:11,color:C.mid,lineHeight:1.8}}>
                    잔금은 실측 후 최종 견적서에서 확정되며 변경될 수 있습니다.
                  </div>
                  <div style={{fontSize:11,color:C.mid,marginTop:4,letterSpacing:0.3}}>
                    계약금 납부 → 실측 → 최종 견적 → 잔금 납부 → 시공
                  </div>
                </div>
              )}
            </div>
          )}

          {form.memo&&(
            <div style={{padding:"12px 16px",background:C.ivory,borderRadius:4,marginBottom:16}}>
              <div style={{fontSize:11,color:C.mid,marginBottom:4}}>특이사항</div>
              <div style={{fontSize:11,color:C.dark,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{form.memo}</div>
            </div>
          )}

          {isEst&&(
            <div style={{fontSize:11,color:C.mid,lineHeight:1.8}}>
              <div>· 본 견적서의 유효기간은 7일입니다.</div>
              <div>· 계약금 납부 → 실측 → 최종 견적 → 잔금 → 시공 순으로 진행됩니다.</div>
              <div>· 기존 레일 재활용 불가 시 1,600원/자가 추가됩니다.</div>
              <div>· 부분 시공 시 방문 횟수별 시공비가 별도 청구됩니다.</div>
            </div>
          )}
          {!isEst&&(
            <div style={{marginTop:4}}>
              <div style={{fontSize:11,color:C.mid,lineHeight:1.8,marginBottom:8}}>
                <div>· 맞춤 제작 특성상 계약 후 취소·환불이 불가합니다.</div>
                <div>· 잔금 완납 후 제작이 시작되며, 시공일이 확정됩니다.</div>
              </div>
              <div style={{padding:"12px 14px",background:C.ivory2,borderTop:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.mid,fontWeight:700,letterSpacing:1.2,marginBottom:6}}>계약 조건</div>
                <div style={{fontSize:10,color:C.mid,lineHeight:1.9}}>
                  <div>① 본 견적서는 실측 전 예상 금액으로, 실측 후 변경될 수 있습니다.</div>
                  <div>② 계약금 입금 후 제작이 진행되며, 취소 시 반환되지 않습니다.</div>
                  <div>③ 원단 발주 후에는 고객 변심에 의한 변경·환불이 불가합니다.</div>
                  <div>④ 제품 하자 발생 시 드로잉엣홈이 책임지고 처리합니다.</div>
                  <div>⑤ 시공 후 고객 확인을 완료한 경우 정상 시공으로 처리됩니다.</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{padding:"10px 22px",background:C.ivory2,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between"}}>
          <div style={{fontSize:11,color:C.light}}>dahcurtain.co.kr · @drawingathome_curtain</div>
          <div style={{fontSize:11,color:C.light}}>구트컴퍼니 · 대표 장선혜</div>
        </div>
      </div>
    </div>
  );
}
export default function App() {
  // ── 관리자 설정 ──
  const DEFAULT_CONFIG = {
    railPrice: 1600,
    seoulBase: 50000,
    gyeonggiBase: 100000,
    railSvc: 25000,
    blindSvc: 10000,
    depositPct: 50,
    spaces: ["거실","안방","아이방","서재","옷방","다용도실","기타"],
  };
  const [config, setConfig] = useState(()=>{
    try{ return {...DEFAULT_CONFIG,...JSON.parse(localStorage.getItem("dah_config")||"{}")}; }
    catch{ return DEFAULT_CONFIG; }
  });
  const saveConfig = (next) => {
    setConfig(next);
    try{ localStorage.setItem("dah_config", JSON.stringify(next)); }catch{}
  };
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPw, setAdminPw] = useState("");
  const [adminAuth, setAdminAuth] = useState(false);
  const ADMIN_PW = "dah2012";


  // config → 전역 공유 (calcRail 등 컴포넌트 밖 함수용)
  useEffect(()=>{
    window.__dah_railPrice = config.railPrice||1600;
    window.__dah_spaces = config.spaces||SPACES;
  }, [config]);

  useEffect(()=>{
    if(!document.querySelector('#dah-font')){
      const l = document.createElement('link');
      l.id='dah-font';
      l.rel='stylesheet';
      l.href='https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap';
      document.head.appendChild(l);
    }
  },[]);

  const printRef = useRef();
  const [showSavedList, setShowSavedList] = useState(false);
  const [viewMode, setViewMode] = useState("customer");
  const [step, setStep] = useState(1);
  const [repairDone, setRepairDone] = useState(false);

  const [form, setForm] = useState(()=>{
    const survey = (()=>{ try{ return JSON.parse(localStorage.getItem("dah_survey")||"{}"); }catch{ return {}; } })();
    // 대시보드에서 고객 선택해서 열었을 때
    const openCust = (()=>{ try{ const d=JSON.parse(localStorage.getItem("dah_open_customer")||"null"); if(d){localStorage.removeItem("dah_open_customer");} return d; }catch{ return null; } })();
    // 대시보드 로그인 세션에서 담당자 가져오기
    const dashSession = (()=>{ try{ return JSON.parse(localStorage.getItem("dah_session")||"null"); }catch{ return null; } })();
    const sessionStaff = dashSession ? dashSession.name : "마스터";
    const prefill = openCust || survey;
    return {
      type:"estimate", customerType: openCust ? "return" : "new",
      clientName:prefill.name||"", clientPhone:prefill.phone||"", clientAddr:prefill.addr||"",
      consultDate:new Date().toISOString().slice(0,10), measureDate:"", workDate:"",
      wallTone:survey.wallTone||"", floorType:survey.floorType||"", spaceDir:survey.homeDir||"",
      diagnosis:"", rxNote:"", rxMainRoom:"", rxProduct:"", rxReason:"", rxColor:"", rxExpert:"",
      region:"", regionCustom:"",
      discountRate:0, discountAmt:0,
      depositPct:config.depositPct||50, payMethod:"현금 / 카드",
      clientRequest:survey.memo||"", svcExtra:"", svcExtraPrice:"",
      repairType:"", repairNote:"", memo:"", balOverride:"", staffName:sessionStaff,
      surveyData: survey,
    };
  });
  const sf = (k,v) => setForm(f=>({...f,[k]:v}));

  const [items, setItems] = useState([newItem(1)]);
  const [nextId, setNextId] = useState(2);
  const [saved, setSaved] = useState(()=>{ try{ return JSON.parse(localStorage.getItem("dah_saved")||"[]"); }catch{ return []; } });

  const addItem = (room="") => { setItems(p=>[...p,{...newItem(nextId),room}]); setNextId(n=>n+1); };
  const rmItem = id => setItems(p=>p.filter(it=>it.id!==id));
  const cpItem = id => { const s=items.find(it=>it.id===id); if(!s) return; setItems(p=>[...p,{...s,id:nextId}]); setNextId(n=>n+1); };
  const upItem = useCallback((id,k,v) => setItems(p=>p.map(it=>it.id===id?{...it,[k]:v}:it)),[]);

  const pItems = items.map(it=>{
    const qC = it.type==="curtain"&&it.qtyAuto ? calcQty(it.w, it.pleat) : null;
    const rC = it.type==="curtain"&&it.rail ? calcRail(it.w) : null;
    const aC = it.type==="blind" ? calcArea(it.w,it.h,it.blindType) : null;
    const qty = it.type==="curtain" ? (it.qtyAuto&&qC?qC.qty:Number(it.qty)||0) : (aC?aC.area:Number(it.qty)||0);
    const price = Number(it.price)||0;
    const total = Number(it.manualTotal)>0 ? Number(it.manualTotal) : (it.type==="curtain"?qty*price:aC?Math.round(aC.area*price):0);
    const autoYards = it.type==="curtain"&&it.h&&qty
      ? Math.ceil((Number(it.h)+20)/91*qty*10)/10
      : null;
    return {...it,qC,rC,aC,qty,total,autoYards};
  });

  const isEst = form.type==="estimate";
  const hasInstall = pItems.some(it => (it.installType||"시공의뢰") === "시공의뢰");
  const isNewCust = form.customerType==="new";
  const isRepair = form.customerType==="repair";
  const showRx = isEst && isNewCust;
  const isFinal = form.type==="final";

  const STEP_LABELS = showRx
    ? ["고객 정보","처방전","품목","견적 설정","미리보기"]
    : ["고객 정보","품목","견적 설정","미리보기"];
  const maxStep = STEP_LABELS.length;

  const getSection = () => {
    if(showRx) return ["고객","처방전","품목","설정","미리보기"][step-1];
    return ["고객","품목","설정","미리보기"][step-1];
  };
  const section = getSection();

  const saveCustomer = () => {
    if(!form.clientName) return;
    setSaved(p=>{
      const next=[{clientName:form.clientName,clientPhone:form.clientPhone,savedAt:new Date().toLocaleDateString()},...p.filter(c=>c.clientName!==form.clientName)].slice(0,30);
      try{localStorage.setItem("dah_saved",JSON.stringify(next));}catch{}
      return next;
    });
    // ── 대시보드 dah_customers 동기화 ──
    try {
      const customers = JSON.parse(localStorage.getItem("dah_customers")||"[]");
      const existing = customers.find(c=>c.clientName===form.clientName);
      const visitCount = existing ? (existing.visitCount||1)+1 : 1;
      const prodSub = pItems.reduce((s,it)=>s+it.total,0);
      const railTotalAmt = pItems.reduce((s,it)=>s+(it.rC&&it.rC.price?it.rC.price:0),0);
      const optTotalAmt = pItems.reduce((s,it)=>s+(Number(it.optionPrice)||0),0);
      const discAmt = Math.round(prodSub*(Number(form.discountRate)||0)/100);
      const grandTotal = prodSub - discAmt + (Number(form.svcTotal)||0);
      const performanceRevenue = prodSub - discAmt - railTotalAmt - optTotalAmt;
      const spaces = [...new Set(pItems.map(it=>it.room).filter(Boolean))].join("+");
      const newEntry = {
        clientName: form.clientName,
        phone: form.clientPhone,
        addr: form.clientAddr,
        space: spaces || pItems.map(it=>it.product||it.type).filter(Boolean).slice(0,2).join("+"),
        price: grandTotal,
        performanceRevenue: Math.max(0, performanceRevenue),
        staffName: form.staffName || "선혜",
        stage: (existing && existing.stage) || "상담",
        date: form.consultDate || new Date().toISOString().slice(0,10),
        memo: form.memo || "",
        visitCount: visitCount,
        createdAt: (existing && existing.createdAt) || new Date().toISOString(),
      };
      const updated = [newEntry, ...customers.filter(c=>c.clientName!==form.clientName)].slice(0,200);
      localStorage.setItem("dah_customers", JSON.stringify(updated));
    } catch(e) { console.error("대시보드 동기화 실패", e); }
    alert("고객 저장 완료 ✅\n대시보드에 반영됐습니다.");
  };

  const loadSurvey = () => {
    try {
      const s = JSON.parse(localStorage.getItem("dah_survey")||"{}");
      if(!s.name){alert("저장된 설문이 없습니다."); return;}
      sf("clientName",s.name||""); sf("clientPhone",s.phone||""); sf("clientAddr",s.addr||"");
      sf("wallTone",s.wallTone||""); sf("floorType",s.floorType||"");
      sf("surveyData",s); alert("설문 불러오기 완료");
    } catch(e){ alert("불러오기 실패"); }
  };

  const handlePDF = async () => {
    try {
      const canvas = await captureEl(); if(!canvas) return;
      let jsPDF;
      try { const m = await import("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"); jsPDF = m.jsPDF; }
      catch { alert("PDF 저장은 배포 환경에서 사용 가능합니다."); return; }
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
      const pW = pdf.internal.pageSize.getWidth();   // 210mm
      const pH = pdf.internal.pageSize.getHeight();   // 297mm
      const margin = 8; // 상하좌우 8mm 여백
      const imgW = pW - margin*2;  // 194mm
      const imgH = canvas.height * imgW / canvas.width;
      let posY = 0;
      while(posY < imgH) {
        if(posY > 0) pdf.addPage();
        pdf.addImage(imgData,"PNG",margin,margin-posY,imgW,imgH);
        posY += pH - margin*2;
      }
      const {fname,ftype,fdate} = getFileInfo();
      pdf.save(`${fname}_${ftype}_${fdate}.pdf`);
    } catch(e){ alert("PDF 오류: "+e.message); }
  };

  const getFileInfo = () => {
    const fname = form.clientName||"견적서";
    const ftype = `${isEst?"가견적":"최종견적"}_${viewMode==="internal"?"내부용":"고객용"}`;
    const d = new Date();
    const fdate = `${String(d.getFullYear()).slice(2)}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
    return {fname,ftype,fdate};
  };

  const captureEl = async () => {
    let html2canvas;
    try { const m = await import("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.esm.js"); html2canvas = m.default; }
    catch { alert("저장 기능은 배포 환경에서 사용 가능합니다."); return null; }
    const el = printRef.current; if(!el) return null;
    const prevW = el.style.width, prevBg = el.style.background;
    el.style.width = "794px"; el.style.background = "#ffffff"; // A4 가로 @96dpi
    const allEls = el.querySelectorAll("*");
    const origBgs = [];
    allEls.forEach(e => {
      const bg = window.getComputedStyle(e).backgroundColor;
      origBgs.push(e.style.backgroundColor);
      if(bg==="rgb(250, 247, 245)"||bg==="rgb(245, 240, 235)"||bg==="rgb(247, 244, 240)") e.style.backgroundColor="#ffffff";
    });
    const canvas = await html2canvas(el,{scale:2,useCORS:true,backgroundColor:"#ffffff",windowWidth:794});
    el.style.width = prevW; el.style.background = prevBg;
    allEls.forEach((e,i)=>{ e.style.backgroundColor=origBgs[i]; });
    return canvas;
  };

  const handleJPG = async () => {
    try {
      const canvas = await captureEl(); if(!canvas) return;
      const {fname,ftype,fdate} = getFileInfo();
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/jpeg", 0.92);
      a.download = `${fname}_${ftype}_${fdate}.jpg`;
      a.click();
    } catch(e){ alert("JPG 오류: "+e.message); }
  };

  const handlePrint = async () => {
    try {
      const canvas = await captureEl(); if(!canvas) return;
      const img = canvas.toDataURL("image/jpeg", 0.95);
      const w = window.open("","_blank");
      w.document.write(`<!DOCTYPE html><html><head><title>견적서</title>
        <style>*{margin:0;padding:0}body{display:flex;justify-content:center;background:#fff}
        img{width:100%;height:auto}
        @media print{@page{size:A4;margin:8mm}body{margin:0}}</style></head>
        <body><img src="${img}" onload="window.print();window.close()"/></body></html>`);
      w.document.close();
    } catch(e){ alert("인쇄 오류: "+e.message); }
  };

  const polishText = async (text, field) => {
    alert("✨ 다듬기 기능은 추후 업데이트 예정입니다.\n처방전 내용을 직접 수정해 주세요.");
  };

  const resetAll = () => {
    if(!window.confirm("초기화할까요?")) return;
    setForm({
      type:"estimate",customerType:"new",
      clientName:"",clientPhone:"",clientAddr:"",
      consultDate:new Date().toISOString().slice(0,10),measureDate:"",workDate:"",
      wallTone:"",floorType:"",spaceDir:"",
      diagnosis:"",rxNote:"",rxMainRoom:"",rxProduct:"",rxReason:"",rxColor:"",rxExpert:"",
      region:"",regionCustom:"",
      discountRate:0,discountAmt:0,depositPct:50,payMethod:"현금 / 카드",
      clientRequest:"",svcExtra:"",svcExtraPrice:"",
      repairType:"",repairNote:"",memo:"",balOverride:"", staffName:sessionStaff,surveyData:null
    });
    setItems([newItem(1)]); setNextId(2); setStep(1);
    setRepairDone(false);
  };
  const cardSt = {maxWidth:794,margin:"0 auto",background:"#fff",overflow:"hidden"};

  return (
    <div style={{minHeight:"100vh",background:"#F7F4F0",fontFamily:FONT,paddingBottom:80,maxWidth:794,margin:"0 auto"}}>


      {/* ── 관리자 모드 모달 ── */}
      {adminOpen&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#fff",width:"100%",maxWidth:420,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{background:C.dark,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>⚙️ 관리자 설정</div>
              <button onClick={()=>setAdminOpen(false)} style={{background:"none",border:"none",color:"#fff",fontSize:18,cursor:"pointer",padding:"0 4px"}}>✕</button>
            </div>
            {!adminAuth?(
              <div style={{padding:20}}>
                <div style={{fontSize:11,color:C.mid,marginBottom:8}}>관리자 비밀번호</div>
                <input type="password" value={adminPw} onChange={e=>setAdminPw(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&(adminPw===ADMIN_PW?setAdminAuth(true):alert("비밀번호가 틀렸습니다."))}
                  style={{...iSt,marginBottom:12}} placeholder="비밀번호 입력"/>
                <button onClick={()=>adminPw===ADMIN_PW?setAdminAuth(true):alert("비밀번호가 틀렸습니다.")}
                  style={{width:"100%",padding:"10px 0",background:C.orange,color:"#fff",border:"none",borderRadius:4,fontSize:13,fontWeight:700,cursor:"pointer"}}>확인</button>
              </div>
            ):(
              <div style={{padding:16}}>
                <div style={{fontSize:11,color:C.mid,letterSpacing:1.2,marginBottom:12}}>시공비 설정</div>
                {[
                  ["레일 단가 (원/자)","railPrice",1600],
                  ["서울 기본 시공금 (편도)","seoulBase",50000],
                  ["경기 기본 시공금 (편도)","gyeonggiBase",100000],
                  ["레일 시공비 (개당)","railSvc",25000],
                  ["블라인드 시공비 (개당)","blindSvc",10000],
                  ["기본 계약금 (%)","depositPct",50],
                ].map(([label,key,def])=>(
                  <div key={key} style={{marginBottom:12}}>
                    <div style={{fontSize:11,color:C.mid,fontWeight:700,marginBottom:4}}>{label}</div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <input type="number" style={{...iSt,flex:1}} value={config[key]??def}
                        onChange={e=>saveConfig({...config,[key]:Number(e.target.value)})}/>
                      <span style={{fontSize:11,color:C.light,whiteSpace:"nowrap"}}>기본 {def.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
                <div style={{height:1,background:C.border,margin:"16px 0"}}/>
                <div style={{fontSize:11,color:C.mid,letterSpacing:1.2,marginBottom:12}}>공간 목록</div>
                <textarea style={{...iSt,minHeight:80,resize:"vertical",fontSize:12}}
                  value={(config.spaces||SPACES).join(",")}
                  onChange={e=>saveConfig({...config,spaces:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})}
                  placeholder="거실,안방,아이방,서재"/>
                <div style={{fontSize:11,color:C.mid,marginTop:4}}>쉼표로 구분해서 입력하세요</div>
                <div style={{fontSize:11,fontWeight:700,color:C.mid,letterSpacing:1.2,marginBottom:6,marginTop:16}}>직원 목록 (선혜 제외, 쉼표 구분)</div>
                <textarea style={{...iSt,minHeight:60,resize:"vertical",fontSize:12}}
                  defaultValue={(()=>{try{return JSON.parse(localStorage.getItem("dah_staff_list")||"[]").join(",");}catch{return "";}})()}
                  onBlur={e=>{
                    const v=e.target.value.split(",").map(s=>s.trim()).filter(Boolean);
                    try{localStorage.setItem("dah_staff_list",JSON.stringify(v));}catch{}
                    alert("직원 목록이 저장됐습니다.");
                  }}
                  placeholder="예) 지수, 민지"/>
                <div style={{fontSize:11,color:C.mid,marginTop:4}}>저장 후 대시보드에 자동 반영됩니다</div>
                <div style={{height:1,background:C.border,margin:"16px 0"}}/>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{if(window.confirm("기본값으로 초기화할까요?"))saveConfig(DEFAULT_CONFIG);}}
                    style={{flex:1,padding:"9px 0",background:"#fff",border:`1px solid ${C.border}`,borderRadius:4,fontSize:12,cursor:"pointer",color:C.mid}}>기본값으로 초기화</button>
                  <button onClick={()=>setAdminOpen(false)}
                    style={{flex:2,padding:"9px 0",background:C.orange,color:"#fff",border:"none",borderRadius:4,fontSize:13,fontWeight:700,cursor:"pointer"}}>저장 완료</button>
                </div>
                <div style={{fontSize:11,color:C.light,marginTop:8,textAlign:"center"}}>변경사항은 즉시 저장됩니다 · Railway 재배포 불필요</div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* 고정 헤더 */}
      <div style={{position:"sticky",top:0,zIndex:100,background:"#fff",borderBottom:`1px solid ${C.border}`,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",maxWidth:794,margin:"0 auto",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>window.location.href="dah-dashboard.html"} style={{padding:"4px 8px",fontSize:11,border:`1px solid ${C.border}`,borderRadius:4,background:"#fff",cursor:"pointer",color:C.mid,flexShrink:0}}>← 대시보드</button>
          <img src={LOGO} alt="DRAWING at HOME" style={{height:16,opacity:1,flexShrink:0}}/>
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
          {[["estimate","가견적서"],["final","최종견적서"]].map(([v,l])=>(
            <button key={v} onClick={()=>{
              sf("type",v);
              if(section!=="미리보기") setStep(1);
            }} style={{padding:"5px 10px",fontSize:11,fontWeight:700,border:`1px solid ${form.type===v?C.orange:C.border}`,borderRadius:4,background:form.type===v?C.orange:"#fff",color:form.type===v?"#fff":C.dark,cursor:"pointer",whiteSpace:"nowrap"}}>{l}</button>
          ))}
          <button onClick={()=>{setAdminOpen(true);setAdminAuth(false);setAdminPw("");}} style={{padding:"5px 7px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:4,background:"#fff",cursor:"pointer",color:C.mid,flexShrink:0}} title="관리자 설정">⚙️</button>
        </div>
      </div>

      {/* 단계바 */}
      <div style={{...cardSt,borderRadius:"0 0 8px 8px",marginTop:0}}>
        <StepBar step={step} maxStep={maxStep} labels={STEP_LABELS}/>
      </div>

      <div style={{maxWidth:640,margin:"12px auto 0",padding:"0 12px"}}>
        {section==="고객"&&(
          <div style={{background:"#fff",padding:"20px 20px 16px",marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:700,color:C.dark,marginBottom:16}}>고객 정보</div>

            {/* 고객 유형 */}
            <F label="고객 유형">
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                {[["new","신규 고객"],["return","재구매"],["repair","수선 · AS"]].map(([v,l])=>(
                  <button key={v} onClick={()=>{sf("customerType",v); setStep(1); setRepairDone(false);}} style={{flex:1,padding:"8px 0",fontSize:11,border:`1px solid ${form.customerType===v?(v==="repair"?C.danger:C.dark):C.border}`,borderRadius:4,background:"#fff",color:form.customerType===v?(v==="repair"?C.danger:C.orange):C.dark,cursor:"pointer",fontWeight:form.customerType===v?700:400}}>{l}</button>
                ))}
              </div>
            </F>

            {/* 불러오기 버튼 — 고객 유형별 분기 */}
            {isNewCust ? (
              <>
                <div style={{fontSize:11,color:C.mid,marginBottom:4}}>고객이 사전 설문을 작성한 경우 정보를 자동으로 채워드립니다</div>
                <button onClick={loadSurvey} style={{width:"100%",background:C.ivory,border:`1px solid ${C.border}`,borderRadius:4,padding:"8px 0",fontSize:11,color:C.dark,cursor:"pointer",marginBottom:8}}>📋 설문 불러오기</button>
              </>
            ) : (
              <button onClick={()=>setShowSavedList(v=>!v)} style={{width:"100%",background:C.ivory,border:`1px solid ${C.border}`,borderRadius:4,padding:"8px 0",fontSize:11,color:C.dark,cursor:"pointer",marginBottom:8}}>👤 고객 정보 불러오기</button>
            )}

            {/* 재구매/수선: 저장 고객 목록 펼침 */}
            {!isNewCust&&showSavedList&&(
              <div style={{border:`1px solid ${C.border}`,borderRadius:4,marginBottom:8,maxHeight:160,overflowY:"auto"}}>
                {saved.length===0
                  ? <div style={{padding:"12px",fontSize:11,color:C.light,textAlign:"center"}}>저장된 고객이 없습니다</div>
                  : saved.map(c=>(
                    <div key={c.clientName} onClick={()=>{sf("clientName",c.clientName); sf("clientPhone",c.clientPhone); setShowSavedList(false);}} style={{padding:"10px 12px",cursor:"pointer",borderBottom:`0.5px solid ${C.border}`,fontSize:11,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontWeight:700,color:C.dark}}>{c.clientName}</div>
                        <div style={{fontSize:11,color:C.mid,marginTop:0}}>{c.clientPhone}</div>
                      </div>
                      <div style={{fontSize:11,color:C.light}}>{c.savedAt}</div>
                    </div>
                  ))
                }
              </div>
            )}

            {/* 고객명 + 신규 고객 자동완성 */}
            <F label="고객명">
              <div style={{position:"relative"}}>
                <input style={iSt} value={form.clientName} placeholder="고객명" onChange={e=>sf("clientName",e.target.value)}
                  onFocus={()=>isNewCust&&setShowSavedList(true)} onBlur={()=>setTimeout(()=>setShowSavedList(false),200)}/>
                {isNewCust&&showSavedList&&saved.length>0&&form.clientName&&(
                  <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:`1px solid ${C.border}`,borderRadius:4,zIndex:10,maxHeight:120,overflowY:"auto"}}>
                    {saved.filter(c=>c.clientName.includes(form.clientName)).map(c=>(
                      <div key={c.clientName} onMouseDown={()=>{sf("clientName",c.clientName); sf("clientPhone",c.clientPhone);}} style={{padding:"8px 12px",cursor:"pointer",borderBottom:`0.5px solid ${C.border}`,fontSize:11}}>
                        <div style={{fontWeight:700}}>{c.clientName}</div>
                        <div style={{fontSize:11,color:C.mid,marginTop:0}}>{c.clientPhone} · {c.savedAt}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </F>

            <F label="연락처">
              <input style={iSt} value={form.clientPhone} placeholder="010-0000-0000" onChange={e=>sf("clientPhone",fmtPhone(e.target.value))}/>
            </F>
            <F label="주소 (아파트·단지명)">
              <input style={iSt} value={form.clientAddr} placeholder="주소" onChange={e=>sf("clientAddr",e.target.value)}/>
            </F>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <F label="상담일"><input style={iSt} type="date" value={form.consultDate} onChange={e=>sf("consultDate",e.target.value)}/></F>
              <F label="실측일"><input style={iSt} type="date" value={form.measureDate} onChange={e=>sf("measureDate",e.target.value)}/></F>
            </div>
            <div style={{fontSize:11,color:C.mid,marginTop:8,marginBottom:4}}>✔ 다음 방문 때 자동완성에 활용됩니다</div>
            <button onClick={saveCustomer} style={{width:"100%",background:"#fff",color:C.dark,fontSize:11,border:`1px solid ${C.border}`,borderRadius:4,padding:"7px 0",cursor:"pointer"}}>고객 저장</button>

            {/* Fix9: 수선·AS 접수 폼 */}
            {isRepair&&!repairDone&&(
              <div style={{marginTop:8,border:"1.5px solid #f0b8b8",borderRadius:4,padding:14,background:"#fff"}}>
                <div style={{fontSize:11,color:C.danger,fontWeight:700,marginBottom:8}}>수선 · AS 접수</div>
                <div style={{display:"flex",gap:6,marginBottom:8}}>
                  {["재실측","재시공","수선"].map(t=>(
                    <button key={t} onClick={()=>sf("repairType",t)} style={{flex:1,padding:"8px 0",fontSize:11,border:`1px solid ${form.repairType===t?C.danger:C.ivory2}`,borderRadius:4,background:form.repairType===t?C.danger:"#fff",color:form.repairType===t?"#fff":C.danger,cursor:"pointer"}}>{t}</button>
                  ))}
                </div>
                {form.repairType&&(
                  <div style={{fontSize:11,color:C.mid,marginBottom:8,lineHeight:1.8}}>
                    {form.repairType==="재실측"&&"드로잉엣홈 실수 시 무료 · 고객 변심 시 유료"}
                    {form.repairType==="재시공"&&"하자 시 무료 · 고객 변심 시 유료"}
                    {form.repairType==="수선"&&"하자 시 무료 · 고객 요청 시 유료"}
                  </div>
                )}
                <textarea style={{width:"100%",padding:"8px 10px",border:"1px solid #f0b8b8",borderRadius:4,fontSize:11,minHeight:60,resize:"vertical",lineHeight:1.8,boxSizing:"border-box",fontFamily:FONT,background:"#fff",marginBottom:8}} value={form.repairNote||""} placeholder="접수 내용 (예: 거실 커튼 길이 수선)" onChange={e=>sf("repairNote",e.target.value)}/>
                <button onClick={()=>{
                  if(!form.repairType){alert("사유를 선택해주세요"); return;}
                  setRepairDone(true);
                  alert(`✅ 접수 완료\n사유: ${form.repairType}\n내용: ${form.repairNote||"없음"}\n고객: ${form.clientName||"미입력"}`);
                }} style={{width:"100%",background:C.danger,border:"none",borderRadius:4,padding:"10px 0",fontSize:13,fontWeight:700,color:"#fff",cursor:"pointer"}}>접수 완료</button>
              </div>
            )}
            {isRepair&&repairDone&&(
              <div style={{marginTop:8,padding:"14px 18px",background:C.ivory2,border:"1.5px solid #48bb78",borderRadius:4,textAlign:"center"}}>
                <div style={{fontSize:13,fontWeight:700,color:C.ok,marginBottom:4}}>✅ 접수 완료</div>
                <div style={{fontSize:11,color:C.ok}}>{form.repairType} · {form.clientName||"고객"}</div>
                <button onClick={()=>{setRepairDone(false); sf("repairType",""); sf("repairNote","");}} style={{marginTop:8,fontSize:11,color:C.mid,background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>다시 입력</button>
              </div>
            )}
          </div>
        )}
        {section==="처방전"&&(
          <div style={{background:"#fff",padding:"20px 20px 16px",marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:700,color:C.dark,marginBottom:4}}>공간 처방전</div>
            <div style={{fontSize:11,color:C.mid,marginBottom:16,lineHeight:1.8}}>상담 내용을 바탕으로 전문가 의견을 작성합니다. 모든 항목은 선택사항이며, ✨ 다듬기로 문장을 자동 개선할 수 있습니다.</div>
            {form.surveyData&&form.surveyData.spaces?.length>0&&(
              <div style={{background:C.ivory,border:`1px solid ${C.border}`,borderRadius:4,padding:"10px 12px",marginBottom:16}}>
                <div style={{fontSize:11,color:C.mid,letterSpacing:1.2,marginBottom:8}}>설문 요약</div>
                <div style={{display:"grid",gridTemplateColumns:"48px 1fr",gap:"4px 8px",fontSize:11}}>
                  {form.surveyData.spaces?.length>0&&<><span style={{color:C.mid}}>공간</span><span>{form.surveyData.spaces.join(" · ")}</span></>}
                  {form.surveyData.budget&&<><span style={{color:C.mid}}>예산</span><span>{form.surveyData.budget}</span></>}
                  {form.surveyData.moods?.length>0&&<><span style={{color:C.mid}}>스타일</span><span>{form.surveyData.moods.join(" · ")}</span></>}
                </div>
              </div>
            )}
            <F label="공간 진단 (전문가 작성)">
              <textarea style={{...iSt,minHeight:64,resize:"vertical",lineHeight:1.8}} value={form.diagnosis} placeholder="예) 남향 오후 직사광이 강하고 저층이라 채광 조절과 프라이버시를 함께 잡아야 하는 구조" onChange={e=>sf("diagnosis",e.target.value)}/>
              <button onClick={()=>polishText(form.diagnosis,"diagnosis")} style={{marginTop:4,fontSize:11,color:C.orange,background:"none",border:`0.5px solid ${C.orange}`,borderRadius:4,padding:"2px 8px",cursor:"pointer"}}>✨ 다듬기</button>
            </F>
            <F label="메모 (공간별 특이사항)">
              <textarea style={{...iSt,minHeight:60,resize:"vertical",lineHeight:1.8}} value={form.rxNote||""} placeholder={"예)\n거실 — 오후 직사광 강함\n안방 — 프라이버시 중요"} onChange={e=>sf("rxNote",e.target.value)}/>
            </F>
            <div style={{height:"0.5px",background:C.border,margin:"8px 0"}}/>
            <F label="주력 공간"><input style={iSt} value={form.rxMainRoom||""} placeholder="예) 거실" onChange={e=>sf("rxMainRoom",e.target.value)}/></F>
            <F label="추천 제품명"><input style={{...iSt,borderColor:C.orange}} value={form.rxProduct||""} placeholder="예) 린넨 쉬어 No.7" onChange={e=>sf("rxProduct",e.target.value)}/></F>
            <F label="추천 이유">
              <textarea style={{...iSt,minHeight:56,resize:"vertical",lineHeight:1.8}} value={form.rxReason||""} placeholder="예) 빛을 완전히 차단하지 않으면서도 프라이버시를 확보해주는 소재예요." onChange={e=>sf("rxReason",e.target.value)}/>
              <button onClick={()=>polishText(form.rxReason,"rxReason")} style={{marginTop:4,fontSize:11,color:C.orange,background:"none",border:`0.5px solid ${C.orange}`,borderRadius:4,padding:"2px 8px",cursor:"pointer"}}>✨ 다듬기</button>
            </F>
            <F label="컬러 제안"><input style={iSt} value={form.rxColor||""} placeholder="예) 아이보리 · 라이트 베이지" onChange={e=>sf("rxColor",e.target.value)}/></F>
            <F label="전문가 코멘트">
              <textarea style={{...iSt,minHeight:56,resize:"vertical",lineHeight:1.8}} value={form.rxExpert||""} placeholder="예) 전체 공간을 아이보리 계열로 통일하시면 더 넓고 깔끔하게 보입니다." onChange={e=>sf("rxExpert",e.target.value)}/>
              <button onClick={()=>polishText(form.rxExpert,"rxExpert")} style={{marginTop:4,fontSize:11,color:C.orange,background:"none",border:`0.5px solid ${C.orange}`,borderRadius:4,padding:"2px 8px",cursor:"pointer"}}>✨ 다듬기</button>
            </F>
          </div>
        )}
        {section==="품목"&&(
          <div>
            {items.map(it=>(
              <ItemCard key={it.id} item={it} onChange={(k,v)=>upItem(it.id,k,v)} onRemove={()=>rmItem(it.id)} onAddSame={room=>addItem(room)} onCopy={()=>cpItem(it.id)} isFinal={isFinal}/>
            ))}
            <button onClick={()=>addItem()} style={{width:"100%",background:"#fff",fontSize:11,border:`1px dashed ${C.border}`,borderRadius:4,padding:10,color:C.mid,cursor:"pointer",marginBottom:8}}>+ 품목 추가</button>
          </div>
        )}
        {section==="설정"&&(
          <div style={{marginBottom:16}}>
            {/* 최종견적서일 때 탭 */}
            {isFinal&&(
              <div style={{display:"flex",gap:4,background:C.ivory2,borderRadius:4,padding:4,marginBottom:8}}>
                {[["설정탭","📋 견적 설정"],["발주탭","📦 발주 정보"]].map(([v,l])=>(
                  <button key={v} onClick={()=>sf("settingTab",v)} style={{flex:1,padding:"9px 0",fontSize:11,fontWeight:700,border:"none",borderRadius:4,background:(form.settingTab||"설정탭")===v?C.orange:"transparent",color:(form.settingTab||"설정탭")===v?"#fff":C.mid,cursor:"pointer",transition:"all 0.15s"}}>{l}</button>
                ))}
              </div>
            )}

            {/* 견적 설정 탭 */}
            {(form.settingTab||"설정탭")==="설정탭"&&(
          <div style={{background:"#fff",padding:"20px 20px 16px"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.dark,marginBottom:16}}>견적 설정</div>
            {/* 시공의뢰 품목이 있을 때만 지역 표시 */}
            {!hasInstall&&(
              <div style={{padding:"10px 14px",background:C.ivory2,border:"1px solid #86efac",borderRadius:4,marginBottom:8,fontSize:11,color:C.ok}}>
                ✔ 전체 셀프시공 — 실측·시공비 없음
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {hasInstall&&<F label="지역 (시공비 기준)">
                <select style={{...sSt,borderColor:hasInstall&&!form.region?C.danger:C.border}} value={form.region} onChange={e=>sf("region",e.target.value)}>
                  <option value="">선택</option><option>서울</option><option>경기</option><option>기타</option>
                </select>
                {hasInstall&&!form.region&&<div style={{fontSize:11,color:C.danger,marginTop:4}}>⚠ 시공의뢰 품목이 있습니다. 지역을 선택해야 시공비가 계산됩니다.</div>}
              </F>}
              {hasInstall&&form.region==="기타"&&<F label="기본금 (원)"><input style={iSt} type="number" value={form.regionCustom} onChange={e=>sf("regionCustom",e.target.value)}/></F>}
              <F label="할인율 (%)"><input style={iSt} type="number" value={form.discountRate} placeholder="0" onChange={e=>sf("discountRate",e.target.value)}/></F>
              <F label="추가 할인 (원)"><input style={iSt} type="number" value={form.discountAmt} placeholder="0" onChange={e=>sf("discountAmt",e.target.value)}/></F>
              <F label="계약금 (%)"><input style={iSt} type="number" value={form.depositPct} onChange={e=>sf("depositPct",e.target.value)}/></F>
              <F label="결제 방법">
                <select style={sSt} value={form.payMethod} onChange={e=>sf("payMethod",e.target.value)}>
                  <option>현금 / 카드</option><option>현금</option><option>카드</option>
                </select>
              </F>
              <F label="기타 항목 (예: 철거비)">
                <input style={iSt} value={form.svcExtra||""} placeholder="철거비 / 이동비 / 철물비 등" onChange={e=>sf("svcExtra",e.target.value)}/>
              </F>
              <F label="기타 금액 (원)">
                <input style={iSt} type="number" value={form.svcExtraPrice||""} placeholder="0" onChange={e=>sf("svcExtraPrice",e.target.value)}/>
              </F>
            </div>
            <F label="잔금 직접 수정 (변경 시만 입력)" hint="미입력 시 자동 계산값 사용">
              <input style={{...iSt,borderColor:form.balOverride?C.orange:undefined}} type="number" value={form.balOverride||""} placeholder={`자동 계산 잔금 사용`} onChange={e=>sf("balOverride",e.target.value)}/>
              {form.balOverride&&<div style={{fontSize:11,color:C.orange,marginTop:4}}>✔ 잔금 {fmt(Number(form.balOverride))}으로 표시됩니다</div>}
            </F>
            <F label="특이사항">
              <textarea style={{...iSt,minHeight:60,resize:"vertical",lineHeight:1.8}} value={form.memo||""} placeholder="예) 기존 레일 재활용 / 샤시 간섭 주의" onChange={e=>sf("memo",e.target.value)}/>
            </F>
            <F label="담당자">
              <div style={{display:"flex",gap:8}}>
                {(()=>{
                  const list = (()=>{try{return JSON.parse(localStorage.getItem("dah_staff_list")||"[]");}catch{return [];}})();
                  return ["선혜",...list].map(v=>(
                    <button key={v} onClick={()=>sf("staffName",v)} style={{flex:1,padding:"9px 0",fontSize:13,fontWeight:form.staffName===v?700:400,border:`1px solid ${form.staffName===v?C.orange:C.border}`,background:form.staffName===v?C.orange:"#fff",color:form.staffName===v?"#fff":C.dark,cursor:"pointer"}}>{v}</button>
                  ));
                })()}
              </div>
            </F>
          </div>
            )}

            {/* 발주 정보 탭 — 최종견적서 + 발주탭일 때 */}
            {isFinal&&(form.settingTab||"설정탭")==="발주탭"&&(
              <div style={{background:"#fff",padding:"16px"}}>
                <div style={{fontSize:13,fontWeight:700,color:C.dark,marginBottom:4}}>발주 정보</div>
                <div style={{fontSize:11,color:C.mid,marginBottom:16}}>상담 후 고객 없을 때 입력하세요. PDF에 포함되지 않습니다.</div>
                {pItems.length===0&&(
                  <div style={{padding:"12px",background:C.ivory,borderRadius:4,fontSize:11,color:C.mid,textAlign:"center"}}>품목을 먼저 추가해주세요</div>
                )}
                {pItems.map((it,idx)=>{
                  const autoYards = it.type==="curtain"&&it.h&&it.qty
                    ? Math.ceil((Number(it.h)+20)/91*Number(it.qty)*10)/10
                    : null;
                  const orderSize = it.type==="blind"&&it.w&&it.h ? `W${it.w} × H${it.h} cm` : null;
                  return (
                    <div key={it.id} style={{marginBottom:16,padding:"12px 14px",background:C.ivory2,borderRadius:4,border:`1px solid ${C.border}`}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.dark,marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:11,color:"#fff",background:C.orange,padding:"2px 7px",borderRadius:4,fontWeight:700}}>{it.room||"공간"}</span>
                        <span>{it.product||"제품명 없음"}</span>
                        {autoYards&&<span style={{fontSize:11,color:C.ok,marginLeft:"auto"}}>▶ {autoYards}마</span>}
                        {orderSize&&<span style={{fontSize:11,color:C.ok,marginLeft:"auto"}}>{orderSize}</span>}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <F label="업체 품번">
                          <input style={iSt} value={it.vendorCode||""} placeholder="예) L-2301" onChange={e=>upItem(it.id,"vendorCode",e.target.value)}/>
                        </F>
                        <F label="담당 거래처">
                          <input style={iSt} value={it.vendor||""} placeholder="예) A원단사" onChange={e=>upItem(it.id,"vendor",e.target.value)}/>
                        </F>
                        {it.type==="curtain"?(
                          <F label="필요 마수" hint={autoYards?`자동: ${autoYards}마`:"사이즈·폭수 입력 후 계산"}>
                            <div style={{display:"flex",gap:4,alignItems:"center"}}>
                              <input style={{...iSt,background:autoYards?C.ivory2:"#fff",fontWeight:autoYards?700:400}} type="number"
                                value={it.neededYards||(autoYards||"")}
                                placeholder={autoYards?String(autoYards):"마"}
                                onChange={e=>upItem(it.id,"neededYards",e.target.value)}/>
                              {autoYards&&<span style={{fontSize:11,color:C.ok,whiteSpace:"nowrap"}}>{autoYards}마</span>}
                            </div>
                          </F>
                        ):(
                          <F label="발주 사이즈" hint="자동계산">
                            <input style={{...iSt,background:orderSize?C.ivory2:"#fff",color:orderSize?C.ok:"inherit"}} value={orderSize||""} readOnly placeholder="가로·세로 입력 후 표시"/>
                          </F>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {section==="미리보기"&&(
          <div>
            {/* 고객용/내부용 토글 */}
            <div style={{display:"flex",gap:4,marginBottom:8,background:C.ivory2,borderRadius:4,padding:4}}>
              {[["customer","👤 고객용"],["internal","🔒 내부용"]].map(([v,l])=>(
                (!isFinal&&v==="internal")?null:
                <button key={v} onClick={()=>setViewMode(v)} style={{flex:1,padding:"9px 0",fontSize:11,fontWeight:700,border:"none",borderRadius:4,background:viewMode===v?C.orange:"transparent",color:viewMode===v?"#fff":C.mid,cursor:"pointer",transition:"all 0.15s"}}>{l}</button>
              ))}
            </div>
            {viewMode==="customer"&&(
              <div style={{padding:"8px 12px",background:C.ivory2,border:"1px solid #86efac",borderRadius:4,marginBottom:8,fontSize:11,color:C.ok}}>
                ✔ 고객용 — 업체 품번·원가·거래처 정보가 PDF에 포함되지 않습니다
              </div>
            )}
            {viewMode==="internal"&&(
              <div style={{padding:"8px 12px",background:C.ivory2,border:"1px solid #f59e42",borderRadius:4,marginBottom:8,fontSize:11,color:C.warn}}>
                🔒 내부용 — 발주 정보가 PDF에 포함됩니다. 고객에게 전달하지 마세요
              </div>
            )}
            {pItems.length===0&&(
              <div style={{padding:"14px",background:C.ivory2,border:"1px solid #f59e42",borderRadius:4,marginBottom:8,fontSize:11,color:C.warn,textAlign:"center"}}>
                ⚠ 품목이 없습니다. 품목 단계로 돌아가 추가해주세요.
              </div>
            )}
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <button onClick={resetAll} style={{flex:1,background:"#fff",color:C.dark,border:`1px solid ${C.border}`,borderRadius:4,padding:"10px 0",fontSize:11,cursor:"pointer"}}>초기화</button>
              <button onClick={handleJPG} disabled={pItems.length===0} style={{flex:1,background:pItems.length===0?C.light:"#fff",border:pItems.length===0?"none":"1px solid #555",color:pItems.length===0?"#fff":C.mid,borderRadius:4,padding:"10px 0",fontSize:11,fontWeight:700,cursor:pItems.length===0?"not-allowed":"pointer",opacity:pItems.length===0?0.6:1}}>🖼 JPG</button>
              <button onClick={handlePrint} disabled={pItems.length===0} style={{flex:1,background:pItems.length===0?C.light:"#fff",border:pItems.length===0?"none":"1px solid #444",color:pItems.length===0?"#fff":C.mid,borderRadius:4,padding:"10px 0",fontSize:11,fontWeight:700,cursor:pItems.length===0?"not-allowed":"pointer",opacity:pItems.length===0?0.6:1}}>🖨 인쇄</button>
              <button onClick={handlePDF} disabled={pItems.length===0} style={{flex:2,background:pItems.length===0?C.light:viewMode==="internal"?C.warn:C.dark,color:"#fff",border:"none",borderRadius:4,padding:"10px 0",fontSize:11,fontWeight:700,cursor:pItems.length===0?"not-allowed":"pointer",opacity:pItems.length===0?0.6:1}}>📄 {viewMode==="customer"?"고객용 PDF":"내부용 PDF"}</button>
            </div>
            <div ref={printRef} style={{width:"100%",maxWidth:640}}>
              {viewMode==="internal"&&isFinal&&(
                <div style={{marginBottom:16,border:"1.5px solid #f59e42",overflow:"hidden"}}>
                  <div style={{background:C.ivory2,borderBottom:`1px solid #f59e42`,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.warn}}>🔒 내부 발주 정보 — 고객 전달 금지</div>
                    <div style={{fontSize:11,color:C.warn}}>총 {pItems.length}개 품목</div>
                  </div>
                  {pItems.length===0&&(
                    <div style={{padding:"12px 14px",fontSize:11,color:C.warn,background:C.ivory2}}>품목 없음</div>
                  )}
                  {pItems.map((it,idx2)=>{
                    const autoY = it.type==="curtain"&&it.h&&it.qty
                      ? Math.ceil((Number(it.h)+20)/91*Number(it.qty)*10)/10 : null;
                    const finalY = it.neededYards||autoY;
                    return (
                      <div key={it.id} style={{padding:"10px 14px",borderTop:"1px solid #fde68a",background:C.ivory2}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.warn}}>
                            <span style={{fontSize:11,border:"1px solid #b45309",color:C.warn,padding:"1px 6px",borderRadius:4,marginRight:6,background:C.ivory2}}>{it.room||"공간"}</span>
                            {it.product||"제품명 미입력"}
                          </div>
                          <div style={{fontSize:11,fontWeight:700,color:C.warn}}>
                            {it.type==="curtain"?`필요 ${finalY||"—"}마`:`발주 W${it.w||"—"}×H${it.h||"—"}cm`}
                          </div>
                        </div>
                        {it.type==="curtain"?(
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 10px",fontSize:11,color:C.warn}}>
                            <div>업체명: <b>{it.vendor||"—"}</b></div>
                            <div>마수: <b style={{color:C.warn}}>{it.neededYards||autoY||"—"}마</b></div>
                            <div>제작 사이즈: <b>{it.w||"—"}×{it.hActual||it.h||"—"}cm</b></div>
                            <div>주름 형태: <b>{it.pleat||"—"}</b></div>
                            <div>개폐 방식: <b>{it.openType||"—"}</b></div>
                            <div>하단 시접: <b>{it.hem||"—"}</b></div>
                            <div style={{gridColumn:"1/-1"}}>형상 가공: <b>{it.fabricProcess||"—"}</b></div>
                          </div>
                        ):(
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 10px",fontSize:11,color:C.warn}}>
                            <div>업체명: <b>{it.vendor||"—"}</b></div>
                            <div>제작 사이즈: <b>{it.w||"—"}×{it.h||"—"}cm</b></div>
                            <div>손잡이: <b>{it.handlePos||"—"}</b></div>
                            <div>끈 길이: <b>{it.cordLength||"—"}</b></div>
                            <div>하단 바: <b>{it.bottomBar||"—"}</b></div>
                            <div>시스템: <b>{it.system||"—"}</b></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{padding:"7px 14px",background:C.border,fontSize:11,color:C.warn}}>
                    ※ 발주 전 품번·거래처·마수를 반드시 확인하세요
                  </div>
                </div>
              )}
              {showRx&&<div style={{marginBottom:16}}><Rx form={form} pItems={pItems} upItem={upItem}/></div>}
              <Quote form={form} pItems={pItems} config={config}/>
            </div>
          </div>
        )}

      </div>

      {/* 하단 네비게이션 (수선 고객이고 접수 완료됐으면 다음 버튼 숨김) */}
      {!(isRepair&&repairDone)&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(255,255,255,0.97)",backdropFilter:"blur(10px)",borderTop:`1px solid ${C.border}`,padding:"12px 20px",display:"flex",gap:8,maxWidth:640,margin:"0 auto"}}>
          {step>1&&(
            <button onClick={()=>setStep(s=>s-1)} style={{flex:1,padding:"12px 0",fontSize:11,border:`1px solid ${C.border}`,background:"#fff",color:C.mid,cursor:"pointer",fontWeight:700}}>← 이전</button>
          )}
          {step<maxStep&&(()=>{const noItem=section==="품목"&&items.length===0;const noRepair=isRepair&&!repairDone;const blocked=noItem||noRepair;return(
            <button onClick={()=>!blocked&&setStep(s=>s+1)} style={{flex:2,padding:"12px 0",fontSize:13,border:"none",borderRadius:4,background:blocked?C.light:C.orange,color:"#fff",cursor:blocked?"not-allowed":"pointer",fontWeight:700,opacity:blocked?0.6:1}}>{noRepair?"수선 접수 후 진행":noItem?"품목을 추가해주세요":"다음 →"}</button>
          );})()} 
          {step===maxStep&&(
            <>
              <button onClick={handleJPG} style={{flex:1,padding:"12px 0",fontSize:11,border:"1px solid #777",borderRadius:4,background:"#fff",color:C.mid,cursor:"pointer",fontWeight:700}}>🖼 JPG</button>
              <button onClick={handlePrint} style={{flex:1,padding:"12px 0",fontSize:11,border:"1px solid #777",borderRadius:4,background:"#fff",color:C.mid,cursor:"pointer",fontWeight:700}}>🖨 인쇄</button>
              <button onClick={handlePDF} style={{flex:2,padding:"12px 0",fontSize:13,border:"none",borderRadius:4,background:C.dark,color:"#fff",cursor:"pointer",fontWeight:700}}>📄 PDF 저장</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}