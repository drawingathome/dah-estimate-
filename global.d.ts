// 2026-09-29(선혜님 - "React 전환부터"): React 18 전역 타입 정의(@types/react, @types/react-dom)를
// 설치해서 참조함 - 이 프로젝트는 CDN/모듈 없이 <script> 태그로 React 자체를 로드하는 방식(JSX 아님,
// React.createElement)이라, "import React from 'react'" 없이도 전역 React/ReactDOM 이름을 타입체커가
// 알아보게 해야 함. 예전엔 survey-app.js가 이미 이 방식으로 React를 썼는데 타입 정의가 아예 없어서
// 관련 오류 148건이 그냥 베이스라인에 묻혀있었음 - 이번에 제대로 갖춤(향후 모든 React 코드의 실제
// 타입 실수를 잡을 수 있게).
/// <reference types="react" />
/// <reference types="react-dom" />
declare const React: typeof import('react');
declare const ReactDOM: typeof import('react-dom/client');

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
  _estOpenMismatch?: any;
  _estMismatchAck?: boolean;
  _estMmRowId?: any;
  // 2026-10-06(선혜님 - 김성은님 견적서 "저장 눌렀어, 프린트까지 했는데" 서버엔 없음): 인쇄·PDF 전 저장 결과를 받는 콜백과, 수정 후 저장 안 한 상태 표시
  _estAfterSave?: ((outcome: 'server' | 'failed' | 'invalid') => void) | null;
  _estDirty?: boolean;
  _estLoadedRow?: any;
  // 2026-10-07(선혜님 - 저장 눌림 관측): est-click-watch.js가 붙이는 전역 이름들
  estObsRecord?: (k: string, d?: any) => void;
  estObsFlush?: (force?: boolean) => void;
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

// Chrome/Edge 전용: 이 문서가 브라우저에 의해 폐기됐다가 다시 불러온 것인지(est-click-watch.js)
interface Document { wasDiscarded?: boolean; }
