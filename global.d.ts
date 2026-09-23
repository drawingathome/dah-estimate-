// global.d.ts
// ══════════════════════════════════════════════════
// DAH 견적서/대시보드 앱 — 가벼운 타입체크(tsc --noEmit)용 전역 선언.
// 2026-09-16(선혜님 - "4번 하자"): 이 코드베이스는 모듈 시스템 없이
// <script> 태그로 전역 스코프를 공유하는 순수 JS라, 어떤 파일이
// "암묵적 전역"(var/let 선언 없이 그냥 대입해서 쓰는 변수, 또는
// window.X = ...로 동적으로 붙이는 프로퍼티)에 의존하는지 타입체커가
// 알 방법이 없음 - 여기서 그런 것들만 최소한으로 선언해서, 실제 코드는
// 전혀 안 바꾸고 "진짜 의심스러운 오류"만 잡아내는 게 목적. 새로운
// window.X 전역을 추가할 때는 여기도 같이 추가할 것.
// ══════════════════════════════════════════════════

declare var currentUser: { name: string, role: 'master' | 'staff', loginAt?: number } | null;
declare var currentTab: string;
declare var supabase: any;
declare var daum: any;
declare function showReloginPrompt(onSuccess: () => void): void;

interface Window {
  _custSaveInFlight?: { [key: string]: boolean };
  _custSaveQueue?: { [key: string]: any };
  _dahVendorListRaw?: any[];
  _estEditState?: any;
  _estCurrentUser?: { name: string, role: 'master' | 'staff' } | null;
  // 2026-09-22(선혜님 - "오류를 모두 확인한거 맞니... 개선을 해야지" -
  // 검증실패 사유를 로그에 남기기 위해 신설): validateEstimate() 실패시
  // 화면에 보여준 것과 같은 이유를 여기 담아 logSaveStage에 전달함.
  _lastValidationFailReason?: string | null;
  _estMoreMenuGlobalListenerBound?: boolean;
  _estRetrySyncInProgress?: boolean;
  _curtainRowSeq?: number;
  _lastSelfCustomerWriteId?: any;
  _lastSelfCustomerWriteTime?: number;
  _reloginPromptShown?: boolean;
  _reloginRetryCount?: number;
  _staffPerfExpanded?: boolean;
  _staffPerfViewMode?: string;
  _vendorArrivalDates?: any;
  _vendorArrivalLocations?: any;
  DAH_BUILD?: string;
  daum?: any;
  supabase?: any;
  selectStaffForLogin?: (who: string) => void;
  updateMobNav?: (activeTab?: string) => void;
}

declare function reportClientError(message: string, stack?: any, extra?: any): void;
declare var html2pdf: any;
// 대시보드 전용 함수 - dash-supabase-auth.js가 두 앱에 공유되면서
// typeof 체크로 안전하게 참조함(견적서 앱엔 실제로 없어도 정상 동작).
declare function sbSyncSetting(key: string, value: any): void;
declare function startRealtimeSync(): void;
declare function stopRealtimeSync(): void;
