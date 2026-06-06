import { useState } from "react";

const LOGO = "/logo.png";

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

function Progress({ step }) {
 if (step === 0) return null;
 return (
  <div style={{ padding: "0 0 24px" }}>
   <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
    {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
     <div key={i} style={{
      flex: 1, height: 3, borderRadius: 4,
      background: i < step ? C.orange : C.border,
      transition: "background 0.3s",
     }} />
    ))}
   </div>
   <div style={{ fontSize: 11, color: C.mid }}>{step} / {TOTAL_STEPS} 단계</div>
  </div>
 );
}

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
 const [submitting, setSubmitting] = useState(false);

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

 // ✅ 구글 시트 연동 완료
 const handleSubmit = async () => {
  setSubmitting(true);
  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwbPf3op3e9uQ6lIDHHiol7g2SA9egZHUL1eU4TSyw5sFniAHsr4NVzLXG4Y4sQcuc2/exec";
  try {
   await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(form),
   });
  } catch (err) {
   console.error("전송 오류:", err);
  }
  setSubmitting(false);
  setSubmitted(true);
 };

 if (submitted) {
  return (
   <div style={{ minHeight: "100vh", background: C.ivory2, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, padding: 24 }}>
    <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
     <div style={{ width: 64, height: 64, borderRadius: "50%", background: C.ivory, border: `2px solid ${C.orange}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}>✓</div>
     <div style={{ fontSize: 20, fontWeight: 700, color: C.dark, marginBottom: 10 }}>설문 완료!</div>
     <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.9, marginBottom: 20 }}>
      {form.name}님, 소중한 답변 감사합니다.
     </div>
     <div style={{ background: C.ivory2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "16px 20px", fontSize: 12, color: C.dark, lineHeight: 1.9, marginBottom: 14, textAlign: "left" }}>
      <div style={{ fontWeight: 700, color: C.dark, marginBottom: 8 }}>방문 전까지 이렇게 준비할게요</div>
      작성해주신 정보 바탕으로 맞춤 소재 준비<br/>
      벽지·바닥 톤에 맞는 컬러 사전 매칭<br/>
      예산에 맞는 제품 라인업 준비
     </div>
     <div style={{ background: C.ivory, border: `1px solid #F0D4B8`, borderRadius: 6, padding: "16px 20px", fontSize: 12, color: C.dark, lineHeight: 1.9, marginBottom: 14, textAlign: "left" }}>
      <div style={{ fontWeight: 700, color: C.dark, marginBottom: 8 }}>도면이나 참고 이미지가 있으시면</div>
      카카오톡으로 미리 보내주시면 더 정확하게 준비할 수 있어요<br/>
      <a href="https://pf.kakao.com/_drawingathome" target="_blank" rel="noreferrer" style={{
       display: "inline-block", marginTop: 8, padding: "8px 16px",
       background: "#FAE100", color: "#282828", borderRadius: 4,
       fontSize: 12, fontWeight: 700, textDecoration: "none",
       fontFamily: FONT,
      }}>드로잉엣홈 카카오채널 바로가기</a>
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
    {step > 0 && <div style={headerSt}>
     <div>
      <img src={LOGO} alt="DRAWING at HOME" style={{ height: 20, display: "block", marginBottom: 4 }}/>
      <div style={{ fontSize: 11, color: C.mid, letterSpacing: 0.5 }}>방문 전 사전 설문지</div>
     </div>
     <div style={{ fontSize: 11, color: C.mid, letterSpacing: 0.5 }}>5단계 · 약 3분</div>
    </div>}

    <div style={bodySt}>
     <Progress step={step} />

     {step === 0 && (
      <div style={{ textAlign: "center", padding: "8px 0 12px" }}>
       <img src={LOGO} alt="DRAWING at HOME" style={{ height: 26, display: "block", margin: "0 auto 12px" }}/>
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
         ["⏱", "5단계 · 약 3분이면 충분해요"],
         ["🔒", "입력 정보는 상담 준비에만 활용됩니다"],
         ["✅", "모르는 항목은 건너뛰셔도 돼요"],
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

     {step === 1 && (<>
      <div style={labelSt}>안녕하세요<br/>먼저 기본 정보를 알려주세요</div>
      <div style={subSt}>상담 준비에 활용하고, 외부에 공유하지 않아요.</div>
      <Input label="성함" value={form.name} onChange={e => sf("name", e.target.value)} placeholder="예) 김○○" />
      <Input label="연락처" value={form.phone} onChange={e => sf("phone", e.target.value)} placeholder="010-0000-0000" type="tel" />
      <Input label="주소 (아파트·단지명)" value={form.addr} onChange={e => sf("addr", e.target.value)} placeholder="예) 반포 래미안 퍼스티지 101동" />
     </>)}

     {step === 2 && (<>
      <div style={labelSt}>어떤 공간에 커튼·블라인드를<br/>설치하실 예정인가요?</div>
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

     {step === 3 && (<>
      <div style={labelSt}>집 전체 정보를<br/>알려주세요</div>
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

     {step === 4 && (<>
      <div style={labelSt}>원하시는 분위기와<br/>중요한 기능이 뭔가요?</div>
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
       <div style={{ fontWeight: 600, color: C.dark, marginBottom: 4 }}>도면이 있으신 경우</div>
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
      <div style={{ background: C.ivory2, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, marginBottom: 4 }}>
       <div style={{ fontSize: 11, color: C.mid, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>제출 내용 확인</div>
       <div style={{ fontSize: 11, color: C.mid, lineHeight: 1.9 }}>
        <div>이름: {form.name}</div>
        <div>연락처: {form.phone}</div>
        <div>주소: {form.addr || "미입력"}</div>
        <div>공간: {form.spaces.join(", ")}</div>
        <div>평수: {form.pyeong || "미선택"}</div>
        <div>집 방향: {form.homeDir || "미선택"}</div>
        <div>벽지 / 바닥: {form.wallTone || "미선택"} / {form.floorType || "미선택"}</div>
        <div>분위기: {form.moods.join(", ") || "미선택"}</div>
        <div>기능: {form.functions.join(", ") || "미선택"}</div>
        <div>예산: {form.budget || "미선택"}</div>
        {form.refUrl && <div>공간 / 창문 사이즈: {form.refUrl}</div>}
       </div>
      </div>
     </>)}

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
