import { useState } from "react";

const LOGO = "data:image/png;base64,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";

// 브랜드 컬러
const C = {
 orange: "#F06E2D",
 dark: "#282828",
 ivory: "#FAF7F5",
 ivory2: "#F5F0EB",
 border: "#EEE6DC",
 mid: "#6B6B6B",
 light: "#B0A99F",
};

const FONT = "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif";


// Google Fonts 로드
if (typeof document !== "undefined") {
 const existing = document.getElementById('drawing-fonts');
 if (!existing) {
  const link = document.createElement("link");
  link.id = "drawing-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600&family=Noto+Serif+KR:wght@300;400;600&display=swap";
  document.head.appendChild(link);
 }
}

const SPACES = ["거실", "안방", "아이방", "서재", "옷방", "다용도실", "기타"];
const HOME_DIRS = ["남향", "동향", "서향", "북향", "모름"];
const WALL_TONES = ["화이트", "크림", "연베이지", "베이지", "연그레이", "그레이"];
const FLOOR_TYPES = ["밝은 우드", "어두운 우드", "대리석 / 타일", "기타"];
const MOODS = ["내추럴 / 린넨", "모던 / 심플", "클래식 / 고급", "북유럽 / 스칸디", "차분 / 무채색", "따뜻 / 아늑"];
const FUNCTIONS = ["빛 조절 (채광)", "완전 차광 (암막)", "프라이버시", "인테리어 포인트", "방음 / 단열"];
const BUDGETS = [
 { label: "100만원 미만", tag: "" },
 { label: "100~200만원", tag: "" },
 { label: "200~300만원", tag: "가장 많음" },
 { label: "300~500만원", tag: "" },
 { label: "500만원 이상", tag: "" },
 { label: "미정", tag: "" },
];
const WIN_SIZES = ["1m 미만", "1~2m", "2m 이상", "모름"];

const TOTAL_STEPS = 5;

// 프로그레스 바
function Progress({ step }) {
 if (step === 0) return null;
 return (
  <div style={{ padding: "0 0 24px" }}>
   <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
    {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
     <div key={i} style={{
      flex: 1, height: 3, borderRadius: 4,
      background: i < step ? C.orange : i === step - 1 ? C.orange : C.border,
      transition: "background 0.3s",
     }} />
    ))}
   </div>
   <div style={{ fontSize: 11, color: C.mid }}>{step} / {TOTAL_STEPS} 단계</div>
  </div>
 );
}

// 체크박스 버튼
function ToggleBtn({ label, selected, onClick }) {
 return (
  <button onClick={onClick} style={{
   padding: "10px 14px", border: `1.5px solid ${selected ? C.orange : C.border}`,
   borderRadius: 4, cursor: "pointer", fontSize: 12,
   background: selected ? C.ivory : "#fff",
   color: selected ? C.dark : C.mid,
   fontFamily: FONT, fontWeight: selected ? 600 : 400,
   transition: "all 0.15s", textAlign: "left",
  }}>{label}</button>
 );
}

// 라디오 버튼
function RadioBtn({ label, selected, onClick }) {
 return (
  <button onClick={onClick} style={{
   padding: "10px 14px", border: `1.5px solid ${selected ? C.orange : C.border}`,
   borderRadius: 4, cursor: "pointer", fontSize: 12,
   background: selected ? C.ivory : "#fff",
   color: selected ? C.dark : C.mid,
   fontFamily: FONT, fontWeight: selected ? 600 : 400,
   transition: "all 0.15s",
  }}>{label}</button>
 );
}

// 입력 필드
function Input({ label, value, onChange, placeholder, type = "text" }) {
 return (
  <div style={{ marginBottom: 14 }}>
   <div style={{ fontSize: 11, color: C.mid, fontWeight: 600, marginBottom: 6 }}>{label}</div>
   <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={{
    width: "100%", padding: "11px 13px", border: `1px solid ${C.border}`,
    borderRadius: 4, fontSize: 13, color: C.dark, background: "#fff",
    boxSizing: "border-box", fontFamily: FONT, outline: "none",
   }} />
  </div>
 );
}


export default function App() {
 const [step, setStep] = useState(0);
 const [form, setForm] = useState({
  name: "", phone: "", addr: "", pyeong: "",
  homeDir: "", homeDirEtc: "",
  wallTone: "", wallToneEtc: "", floorType: "", floorTypeEtc: "",
  spaces: [],
  moods: [], moodsEtc: "",
  functions: [], functionsEtc: "",
  budget: "", budgetEtc: "",
  refUrl: "",
  memo: "",
 });
 const [submitted, setSubmitted] = useState(false);

 const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

 const toggleSpace = (s) => {
  const cur = form.spaces;
  sf("spaces", cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]);
 };

 const toggleArr = (k, v) => {
  const cur = form[k];
  sf(k, cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]);
 };

 const canNext = () => {
  if (step === 1) return form.name && form.phone;
  if (step === 2) return form.spaces.length > 0;
  if (step === 3) return true;
  if (step === 4) return form.moods.length > 0 && form.functions.length > 0;
  return true;
 };

 const [submitting, setSubmitting] = useState(false);

 const handleSubmit = async () => {
  setSubmitting(true);
  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby-MQSYO69RvaLNdQ8KjZLWVE7Nqp43SBzvAegRxgtAq3DrPn_vAXvppDRMkobP04AwTQ/exec";
  try {
   await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
     name: form.name,
     phone: form.phone,
     addr: form.addr,
     spaces: form.spaces,
     pyeong: form.pyeong || "",
     homeDir: form.homeDir || "",
     wallTone: form.wallTone || "",
     floorType: form.floorType || "",
     moods: form.moods,
     functions: form.functions,
     budget: form.budget || "",
     memo: form.memo || "",
    }),
   });
  } catch (e) {
   console.warn("구글 시트 저장 실패:", e);
  }
  setSubmitting(false);
  setSubmitted(true);
 };

 // 제출 완료 화면
 if (submitted) {
  return (
   <div style={{ minHeight: "100vh", background: C.ivory2, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, padding: 24 }}>
    <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
     <div style={{ width: 64, height: 64, borderRadius: "50%", background: C.ivory, border: `2px solid ${C.orange}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}></div>
     <div style={{ fontSize: 20, fontWeight: 700, color: C.dark, marginBottom: 10 }}>설문 완료!</div>
     <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.9, marginBottom: 20 }}>
      {form.name}님, 소중한 답변 감사합니다.
     </div>
     <div style={{ background: C.ivory2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "16px 20px", fontSize: 12, color: C.dark, lineHeight: 1.9, marginBottom: 14, textAlign: "left" }}>
      <div style={{ fontWeight: 700, color: C.dark, marginBottom: 8 }}>방문 전까지 이렇게 준비할게요 </div>
       작성해주신 정보 바탕으로 맞춤 소재 준비<br/>
       벽지·바닥 톤에 맞는 컬러 사전 매칭<br/>
       예산에 맞는 제품 라인업 준비
     </div>
     <div style={{ background: C.ivory, border: `1px solid #F0D4B8`, borderRadius: 6, padding: "16px 20px", fontSize: 12, color: C.dark, lineHeight: 1.9, marginBottom: 14, textAlign: "left" }}>
      <div style={{ fontWeight: 700, color: C.dark, marginBottom: 8 }}> 도면이나 참고 이미지가 있으시면</div>
      카카오톡으로 미리 보내주시면 더 정확하게 준비할 수 있어요<br/>
      <a href="https://pf.kakao.com/_drawingathome" target="_blank" rel="noreferrer" style={{
       display: "inline-block", marginTop: 8, padding: "8px 16px",
       background: "#FAE100", color: "#282828", borderRadius: 4,
       fontSize: 12, fontWeight: 700, textDecoration: "none",
       fontFamily: FONT,
      }}> 드로잉엣홈 카카오채널 바로가기</a>
     </div>
     <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 20px", fontSize: 12, color: C.mid, lineHeight: 1.9 }}>
       예약일에 반포동 쇼룸에서 뵙겠습니다<br/>
       추가 문의도 카카오톡으로 편하게 연락 주세요
     </div>
    </div>
   </div>
  );
 }

 const containerSt = {
  minHeight: "100vh", background: C.ivory2,
  display: "flex", alignItems: "flex-start", justifyContent: "center",
  padding: "32px 16px", fontFamily: FONT,
 };

 const cardSt = {
  maxWidth: 520, width: "100%",
  background: "#fff", borderRadius: 6,
  boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
  overflow: "hidden",
 };


 const headerSt = {
  background: "#fff",
  borderBottom: `1px solid ${C.border}`,
  padding: "18px 28px",
  display: "flex", alignItems: "center", justifyContent: "space-between",
 };

 const bodySt = { padding: "24px 28px 28px" };

 const labelSt = {
  fontSize: 16, fontWeight: 600, color: C.dark,
  marginBottom: 6, lineHeight: 1.7,
 };

 const subSt = { fontSize: 13, color: C.mid, marginBottom: 20, lineHeight: 1.7 };

 const btnSt = (disabled) => ({
  width: "100%", padding: "14px 0",
  background: disabled ? C.border : C.orange,
  color: disabled ? C.light : "#fff",
  border: "none", borderRadius: 4, fontSize: 14, fontWeight: 700,
  cursor: disabled ? "not-allowed" : "pointer",
  fontFamily: FONT, letterSpacing: 0.5,
  transition: "all 0.15s",
 });

 return (
  <div style={containerSt}>
   <div style={cardSt}>
    {/* 헤더 - 인트로에선 숨김 */}
    {step > 0 && <div style={headerSt}>
     <div>
      <img src={LOGO} alt="DRAWING at HOME" style={{ height: 20, display: "block", marginBottom: 4 }}/>
      <div style={{ fontSize: 11, color: C.mid, letterSpacing: 0.5 }}>방문 전 사전 설문지</div>
     </div>
     <div style={{ fontSize: 11, color: C.mid, letterSpacing: 0.5 }}>5단계 · 약 3분</div>
    </div>}

    <div style={bodySt}>
     <Progress step={step} />

     {/* STEP 0 — 인트로 */}
     {step === 0 && (
      <div style={{ textAlign: "center", padding: "8px 0 12px" }}>
       <img src={LOGO} alt="DRAWING at HOME" style={{ height: 26, display: "block", margin: "0 auto 12px" }}/>
       {/* 경력 자동 계산 — 2012년 창업 기준 */}
       <div style={{ fontSize: 11, color: C.mid, letterSpacing: 0.5, marginBottom: 20 }}>
        {"서울 반포동 쇼룸 · 커튼·블라인드 "+(new Date().getFullYear()-2012+1)+"년째"}
       </div>
       <div style={{ fontSize: 17, fontWeight: 600, color: C.dark, marginBottom: 16, lineHeight: 1.7 }}>방문 전 사전 설문지</div>

       <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.9, marginBottom: 20, textAlign: "left", background: C.ivory2, borderRadius: 6, padding: "14px 18px", borderLeft: `3px solid ${C.border}` }}>
        고객님의 정보와 니즈를 미리 파악해<br/>
        <span style={{ fontWeight: 600, color: C.dark }}>상담 시간을 더 효율적으로</span> 활용하기 위해 준비했어요.<br/><br/>
        자세한 정보를 주실수록 공간에 딱 맞는 제품을<br/>
        미리 준비해 <span style={{ fontWeight: 600, color: C.dark }}>더 정확한 추천</span>을 드릴 수 있습니다.
       </div>

       <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
        {[
         ["", "5단계 · 약 3분이면 충분해요"],
         ["", "입력 정보는 상담 준비에만 활용됩니다"],
         ["", "모르는 항목은 건너뛰셔도 돼요"],
        ].map(([icon, text]) => (
         <div key={text} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: C.mid, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 4, padding: "9px 14px" }}>
          <span style={{ fontSize: 15 }}>{icon}</span>{text}
         </div>
        ))}
       </div>
       <button onClick={() => setStep(1)} style={{ width: "100%", padding: "14px 24px", background: C.orange, color: "#fff", border: "none", borderRadius: 4, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT, letterSpacing: 0.5 }}>
        설문 시작하기 →
       </button>
      </div>
     )}

     {/* STEP 1 — 기본 정보 */}
     {step === 1 && (<>
      <div style={labelSt}>안녕하세요 <br />먼저 기본 정보를 알려주세요</div>
      <div style={subSt}>상담 준비에 활용하고, 외부에 공유하지 않아요.</div>
      <Input label="성함" value={form.name} onChange={e => sf("name", e.target.value)} placeholder="예) 김○○" />
      <Input label="연락처" value={form.phone} onChange={e => sf("phone", e.target.value)} placeholder="010-0000-0000" type="tel" />
      <Input label="주소 (아파트·단지명)" value={form.addr} onChange={e => sf("addr", e.target.value)} placeholder="예) 반포 래미안 퍼스티지 101동" />
     </>)}

     {/* STEP 2 — 공간 선택 */}
     {step === 2 && (<>
      <div style={labelSt}>어떤 공간에 커튼·블라인드를<br />설치하실 예정인가요?</div>
      <div style={subSt}>해당하는 공간을 모두 선택해주세요.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
       {SPACES.map(s => (
        <ToggleBtn key={s} label={s} selected={form.spaces.includes(s)} onClick={() => toggleSpace(s)} />
       ))}
      </div>
      {form.spaces.length > 0 && (
       <div style={{ marginTop: 14, padding: "10px 14px", background: C.ivory, borderRadius: 4, fontSize: 11, color: C.orange }}>
        선택: {form.spaces.join(" · ")}
       </div>
      )}

      <div style={{ marginTop: 20 }}>
       <div style={{ fontSize: 12, color: C.dark, fontWeight: 600, marginBottom: 8 }}>평수</div>
       <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {["10평대", "20평대", "30평대", "40평대", "50평대 이상", "직접입력", "모름"].map(p => (
         <RadioBtn key={p} label={p} selected={form.pyeong === p} onClick={() => sf("pyeong", p)} />
        ))}
       {form.pyeong === "직접입력" && (
        <input value={form.pyeongEtc||""} onChange={e => sf("pyeongEtc", e.target.value)}
         placeholder="예) 63평" style={{ padding: "8px 10px", border: `1.5px solid ${C.orange}`, borderRadius: 4, fontSize: 12, fontFamily: FONT, outline: "none", marginTop: 4 }}/>
       )}
       </div>
      </div>
     </>)}

     {/* STEP 3 — 집 전체 정보 */}
     {step === 3 && (<>
      <div style={labelSt}>집 전체 정보를<br />알려주세요</div>
      <div style={subSt}>소재 선택에 꼭 필요한 정보예요. 잘 모르셔도 괜찮아요.</div>

      <div style={{ fontSize: 12, color: C.dark, fontWeight: 600, marginBottom: 8 }}>집 방향 (거실 기준)</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: form.homeDir === "기타" ? 8 : 20 }}>
       {HOME_DIRS.map(d => (
        <RadioBtn key={d} label={d} selected={form.homeDir === d} onClick={() => sf("homeDir", d)} />
       ))}
      </div>
      {form.homeDir === "기타" && (
       <input value={form.homeDirEtc} onChange={e => sf("homeDirEtc", e.target.value)}
        placeholder="예) 북동향" style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.orange}`, borderRadius: 4, fontSize: 12, fontFamily: FONT, outline: "none", boxSizing: "border-box", marginBottom: 20 }}/>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 4 }}>
       <div>
        <div style={{ fontSize: 12, color: C.dark, fontWeight: 600, marginBottom: 8 }}>벽지 톤</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
         {[["화이트 / 크림","화이트,크림"],["연베이지 / 베이지","연베이지,베이지"],["연그레이 / 그레이","연그레이,그레이"],["기타","기타"]].map(([label, val]) => (
          <RadioBtn key={val} label={label} selected={form.wallTone===val} onClick={()=>sf("wallTone",val)}/>
         ))}
        </div>
        {form.wallTone === "기타" && (
         <input value={form.wallToneEtc} onChange={e => sf("wallToneEtc", e.target.value)}
          placeholder="직접 입력" style={{ width:"100%", padding: "8px 10px", border: `1.5px solid ${C.orange}`, borderRadius: 4, fontSize: 12, fontFamily: FONT, outline: "none", marginTop: 4, boxSizing:"border-box" }}/>
        )}
       </div>
       <div>
        <div style={{ fontSize: 12, color: C.dark, fontWeight: 600, marginBottom: 8 }}>바닥 자재</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
         {FLOOR_TYPES.map(f => (
          <RadioBtn key={f} label={f} selected={form.floorType === f} onClick={() => sf("floorType", f)} />
         ))}
         {form.floorType === "기타" && (
          <input value={form.floorTypeEtc} onChange={e => sf("floorTypeEtc", e.target.value)}
           placeholder="직접 입력" style={{ padding: "8px 10px", border: `1.5px solid ${C.orange}`, borderRadius: 4, fontSize: 12, fontFamily: FONT, outline: "none", marginTop: 2 }}/>
         )}
        </div>
       </div>
      </div>
     </>)}

     {/* STEP 4 — 스타일·기능 */}
     {step === 4 && (<>
      <div style={labelSt}>원하시는 분위기와<br />중요한 기능이 뭔가요?</div>
      <div style={subSt}>분위기와 기능 모두 복수 선택 가능해요.</div>

      <div style={{ fontSize: 12, color: C.dark, fontWeight: 600, marginBottom: 8 }}>원하는 분위기</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 8 }}>
       {MOODS.map(m => (
        <ToggleBtn key={m} label={m} selected={form.moods.includes(m)} onClick={() => toggleArr("moods", m)} />
       ))}
       <ToggleBtn label="기타" selected={form.moods.includes("기타")} onClick={() => toggleArr("moods", "기타")} />
      </div>
      {form.moods.includes("기타") && (
       <input value={form.moodsEtc} onChange={e => sf("moodsEtc", e.target.value)}
        placeholder="예) 호텔 스타일, 빈티지 등" style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.orange}`, borderRadius: 4, fontSize: 12, fontFamily: FONT, outline: "none", boxSizing: "border-box", marginBottom: 20 }}/>
      )}
      {!form.moods.includes("기타") && <div style={{ marginBottom: 12 }}/>}

      <div style={{ fontSize: 12, color: C.dark, fontWeight: 600, marginBottom: 8 }}>중요한 기능</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 8 }}>
       {[...FUNCTIONS, "기타"].map(f => (
        <ToggleBtn key={f} label={f} selected={form.functions.includes(f)} onClick={() => toggleArr("functions", f)} />
       ))}
      </div>
      {form.functions.includes("기타") && (
       <input value={form.functionsEtc} onChange={e => sf("functionsEtc", e.target.value)}
        placeholder="예) 전동/스마트홈 연동 등" style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.orange}`, borderRadius: 4, fontSize: 12, fontFamily: FONT, outline: "none", boxSizing: "border-box", marginBottom: 20 }}/>
      )}
      {!form.functions.includes("기타") && <div style={{ marginBottom: 12 }}/>}

      <div style={{ fontSize: 12, color: C.dark, fontWeight: 600, marginBottom: 8 }}>예산 범위</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
       {BUDGETS.map(b => (
        <button key={b.label} onClick={() => sf("budget", b.label)} style={{
         padding: "10px 14px", border: `1.5px solid ${form.budget === b.label ? C.orange : C.border}`,
         borderRadius: 4, cursor: "pointer", fontSize: 12,
         background: form.budget === b.label ? C.orange : "#fff",
         color: form.budget === b.label ? "#fff" : C.mid,
         fontFamily: FONT, fontWeight: form.budget === b.label ? 700 : 400,
         transition: "all 0.15s", display: "flex", alignItems: "center", gap: 7,
        }}>
         {b.label}
         {b.tag && (
          <span style={{
           fontSize: 11, padding: "2px 6px", borderRadius: 10,
           background: form.budget === b.label ? "rgba(255,255,255,0.2)" : C.ivory2,
           color: form.budget === b.label ? "#fff" : C.mid,
           fontWeight: 700, letterSpacing: 0.5, whiteSpace: "nowrap",
          }}>{b.tag}</span>
         )}
        </button>
       ))}
      </div>
     </>)}

     {/* STEP 5 — 창문 사이즈·메모 */}
     {step === 5 && (<>
      <div style={labelSt}>공간 / 창문 사이즈를<br/>알고 계신가요?</div>
      <div style={subSt}>대략적인 사이즈를 미리 알면 방문 전에 견적 범위를 준비할 수 있어요.</div>

      <div style={{ marginBottom: 16 }}>
       <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: C.mid, fontWeight: 600 }}>커튼 → 공간 사이즈 / 블라인드 → 창문 사이즈</div>
       </div>
       <textarea
        value={form.refUrl}
        onChange={e => sf("refUrl", e.target.value)}
        placeholder={"예) 커튼: 거실 공간 가로 350cm × 높이 240cm\n블라인드: 안방 창문 가로 160cm × 높이 130cm\n(모르시면 비워두셔도 돼요)"}
        style={{
         width: "100%", minHeight: 80, padding: "11px 13px",
         border: `1px solid ${C.border}`, borderRadius: 4,
         fontSize: 12, color: C.dark, background: "#fff",
         boxSizing: "border-box", fontFamily: FONT, resize: "vertical",
         outline: "none", lineHeight: 1.9,
        }}
       />

      </div>

      <div style={{ background: C.ivory2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.orange}`, borderRadius: 4, padding: "14px 16px", marginBottom: 16, fontSize: 12, color: C.mid, lineHeight: 1.9 }}>
       <div style={{ fontWeight: 600, color: C.dark, marginBottom: 4 }}> 도면이 있으신 경우</div>
       사이즈를 모르시면 도면을 카카오톡으로 미리 보내주세요.<br/>
       방문 전에 확인하고 더 정확하게 준비할게요.<br/>
       <span style={{ fontSize: 11, color: C.mid }}>설문 완료 후 카카오 채널로 안내드려요</span>
      </div>

      <div style={{ marginBottom: 14 }}>
       <div style={{ fontSize: 11, color: C.mid, fontWeight: 600, marginBottom: 6 }}>추가로 전달할 내용 (선택)</div>
       <textarea
        value={form.memo}
        onChange={e => sf("memo", e.target.value)}
        placeholder="예) 기존 레일이 있어요 / 반려동물이 있어요 / 시공 날짜가 정해져 있어요 / 샤시 교체 예정"
        style={{
         width: "100%", minHeight: 80, padding: "11px 13px",
         border: `1px solid ${C.border}`, borderRadius: 4,
         fontSize: 12, color: C.dark, background: "#fff",
         boxSizing: "border-box", fontFamily: FONT, resize: "vertical",
         outline: "none", lineHeight: 1.7,
        }}
       />
      </div>

      {/* 제출 전 요약 */}
      <div style={{ background: C.ivory2, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, marginBottom: 4 }}>
       <div style={{ fontSize: 11, color: C.mid, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>제출 내용 확인</div>
       <div style={{ fontSize: 11, color: C.mid, lineHeight: 1.9 }}>
        <div> 이름: {form.name}</div>
        <div> 연락처: {form.phone}</div>
        <div> 주소: {form.addr || "미입력"}</div>
        <div> 공간: {form.spaces.join(", ")}</div>
        <div> 평수: {form.pyeong || "미선택"}</div>
        <div> 집 방향: {form.homeDir || "미선택"}</div>
        <div> 벽지 / 바닥: {form.wallTone || "미선택"} / {form.floorType || "미선택"}</div>
        <div> 분위기: {form.moods.join(", ") || "미선택"}</div>
        <div> 기능: {form.functions.join(", ") || "미선택"}</div>
        <div> 예산: {form.budget || "미선택"}</div>
        {form.refUrl&&<div> 공간 / 창문 사이즈: {form.refUrl}</div>}
       </div>
      </div>
     </>)}

     {/* 버튼 */}
     {step > 0 && <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
       {step > 1 && (
        <button onClick={() => setStep(s => s - 1)} style={{
         width: 80, padding: "14px 0", background: "#fff",
         color: C.mid, border: `1px solid ${C.border}`,
         borderRadius: 4, fontSize: 12, cursor: "pointer", fontFamily: FONT,
        }}>이전</button>
       )}
       {step < TOTAL_STEPS ? (
        <button
         onClick={() => canNext() && setStep(s => s + 1)}
         style={btnSt(!canNext())}
        >
         다음 →
        </button>
       ) : (
        <button onClick={handleSubmit} disabled={submitting} style={btnSt(submitting)}>
         {submitting ? "제출 중..." : "제출하기"}
        </button>
       )}
      </div>
      {[3, 4, 5].includes(step) && step < TOTAL_STEPS && (
       <button onClick={() => setStep(s => s + 1)} style={{
        width: "100%", padding: "12px 0", background: "#fff",
        color: C.mid, border: `1px solid ${C.border}`,
        borderRadius: 4, fontSize: 12, fontFamily: FONT,
        cursor: "pointer", marginTop: 2,
       }}>이 단계 건너뛰기</button>
      )}
     </div>}
    </div>
   </div>
  </div>
 );
}
