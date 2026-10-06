# 코드 지도 (자동 생성 — 직접 고치지 마세요)

"이 기능이 어느 파일에 있지?"를 찾는 지도예요. 코드에서 자동으로 뽑아서 만들어요.
함수를 추가/삭제/이동했다면 `node scripts/gen-code-map.js` 를 실행해서 갱신하세요 (안 하면 자동 검사가 알려줘요).

함수 이름으로 찾으려면 아래 **"함수 찾기"** 표에서 검색하세요.

## 대시보드 앱 (dah-dashboard.html) — 브라우저가 불러오는 순서대로

| # | 파일 | 역할 | 함수 수 |
|---|---|---|---|
| 1 | `shared-staging-guard.js` | DAH 공용 — 스테이징 환경 쓰기 차단 안전장치 | 0 |
| 2 | `dash-utils.js` | DAH 대시보드 — 순수 유틸리티 함수 모음 | 17 |
| 3 | `dash-api.js` | DAH 대시보드 — 데이터 접근 계층 (Supabase / localStorage) | 5 |
| 4 | `dash-api-settings.js` | DAH 대시보드 — 설정 접근자 (담당자/거래처/리드기준/지역비/쿠폰/담당자 이메일) | 13 |
| 5 | `dash-api-data.js` | DAH 대시보드 — 데이터 변환·로딩 (DB행↔화면 객체, 고객/견적 불러오기) | 7 |
| 6 | `dash-api-writes.js` | DAH 대시보드 — 고객 DB 쓰기 (저장/선점/보관/삭제/복구/리드보류) | 7 |
| 7 | `shared-common-utils.js` | DAH 공용 — 두 앱(대시보드/견적서)에서 완전히 동일하게 써야 하는 | 9 |
| 8 | `shared-optimistic-lock.js` | DAH 공용 — 낙관적 잠금(동시저장충돌) 락값 갱신 | 2 |
| 9 | `dash-sync-queue.js` | DAH — 오프라인/네트워크 실패 동기화 큐 (2026-08-05 신규) | 6 |
| 10 | `dash-supabase-auth.js` | DAH 대시보드 — Supabase Auth 연동 | 16 |
| 11 | `dash-realtime.js` | 실시간 동기화 (Supabase Realtime) | 9 |
| 12 | `dash-ui-helpers.js` | DAH 대시보드 — UI 헬퍼 / 입력값 검증 함수 모음 | 15 |
| 13 | `dash-core.js` | DAH 대시보드 — 앱 핵심 진입점 함수 | 1 |
| 14 | `dash-render.js` | DAH 대시보드 — 홈/견적목록/고객검색 화면 렌더링 | 5 |
| 15 | `dash-failed-saves.js` | DAH 대시보드 — 저장 실패 백업 확인/복구 화면 | 6 |
| 16 | `dash-render-est.js` | 견적서 탭(가견적/확정견적 목록) 렌더링 | 2 |
| 17 | `dash-render-search.js` | 고객목록(검색) 탭 렌더링 | 1 |
| 18 | `dash-memo.js` | DAH 대시보드 — 빠른 메모 문구 기능 | 2 |
| 19 | `dash-chart.js` | DAH 대시보드 — 매출 차트 기능 | 8 |
| 20 | `dash-calendar.js` | DAH 대시보드 — 일정(캘린더) 기능 | 5 |
| 21 | `dash-kanban.js` | DAH 대시보드 — 진행현황(칸반) 기능 | 9 |
| 22 | `dash-customer-pay.js` | 고객상세 - 결제(선금/잔금) 탭 렌더링 | 1 |
| 23 | `dash-customer-alim.js` | 고객상세 - 소통(알림톡) 탭 렌더링 | 11 |
| 24 | `dash-customer-order.js` | 고객상세 - 발주 탭 렌더링 | 5 |
| 25 | `dash-customer-as.js` | 고객상세 - AS 탭 렌더링 (React 전환 1호) | 2 |
| 26 | `dash-customer-detail.js` | DAH 대시보드 — 고객상세 모달 기능 | 8 |
| 27 | `dash-customer-detail-tabs.js` | DAH 대시보드 — 고객상세 모달: 정보탭/할일 + 하단 버튼·단계변경·삭제·복구 | 8 |
| 28 | `dash-customer-estimates.js` | DAH 대시보드 — 고객상세: 견적서 탭 · 견적서 이력/열기/불러오기 | 8 |
| 29 | `dash-customer-add.js` | 고객 추가/수정 모달 (React 전환 2호) | 3 |
| 30 | `dash-auth.js` | DAH 대시보드 — 로그인/세션/권한 기능 | 5 |
| 31 | `dash-settings.js` | DAH 대시보드 — 설정 화면 기능 | 8 |
| 32 | `dash-settings-sections.js` | DAH 대시보드 — 설정 화면 구역별 렌더링 (거래처/메모/지역비/쿠폰/연동/데이터) | 6 |
| 33 | `dash-export.js` | DAH 대시보드 — 백업 / 엑셀 내보내기 기능 | 6 |
| 34 | `dash-search.js` | DAH 대시보드 — 검색 / 날짜필터 기능 | 4 |

## 견적서 앱 (dah-estimate.html) — 브라우저가 불러오는 순서대로

| # | 파일 | 역할 | 함수 수 |
|---|---|---|---|
| 1 | `shared-staging-guard.js` | DAH 공용 — 스테이징 환경 쓰기 차단 안전장치 | 0 |
| 2 | `est-public-view.js` | DAH 견적서 앱 — 고객용 공개보기 모드 | 5 |
| 3 | `est-utils.js` | DAH 견적서 앱 — 유틸함수 + API 설정 | 21 |
| 4 | `shared-common-utils.js` | DAH 공용 — 두 앱(대시보드/견적서)에서 완전히 동일하게 써야 하는 | 9 |
| 5 | `shared-optimistic-lock.js` | DAH 공용 — 낙관적 잠금(동시저장충돌) 락값 갱신 | 2 |
| 6 | `est-sync-queue.js` | DAH 견적서 앱 — 오프라인/네트워크 실패 재시도 큐 (2026-08-05 신규) | 5 |
| 7 | `dash-supabase-auth.js` | DAH 대시보드 — Supabase Auth 연동 | 16 |
| 8 | `est-form-controls.js` | DAH 견적서 앱 — 폼 상태/타입 제어 | 13 |
| 9 | `est-calc-rules.js` | DAH 견적서 앱 — 계산 규칙 (순수 함수: 화면/저장소를 전혀 안 만짐) | 23 |
| 10 | `est-product-calc.js` | DAH 견적서 앱 — 공통 계산: 합계(calcTotal)/얼림 금액/행 삭제/드래그 정렬 | 10 |
| 11 | `est-calc-curtain.js` | DAH 견적서 앱 — 커튼 행 계산 (추가/폭수·금액 계산/레일 자동/복사) | 4 |
| 12 | `est-calc-blind.js` | DAH 견적서 앱 — 블라인드 행 계산 (추가/최소면적/옵션 추가금/부자재 자동/복사) | 6 |
| 13 | `est-calc-svc.js` | DAH 견적서 앱 — 기타품목 · 부자재/서비스(실측비·시공비·레일) 행 계산과 요약 | 12 |
| 14 | `est-survey.js` | DAH 견적서 앱 — 설문지 연동 | 2 |
| 15 | `est-save.js` | DAH 견적서 앱 — 저장/검증/토스트 | 17 |
| 16 | `est-save-stages.js` | DAH 견적서 앱 — 저장 단계 함수 4개 (고객 저장 → 견적서 저장 → 로컬 저장) | 4 |
| 17 | `est-doc-customer.js` | DAH 견적서 앱 — 고객용 견적서 문서 생성 | 2 |
| 18 | `est-doc-vendor.js` | DAH 견적서 앱 — 거래처별 발주서 문서 생성 | 5 |
| 19 | `est-doc-vendor-ui.js` | DAH 견적서 앱 — 발주서: 거래처 정보 입력 모달 + 발주서 선택/인쇄 | 4 |
| 20 | `est-doc-request.js` | DAH 견적서 앱 — 실측/시공 의뢰서 문서 생성 | 4 |
| 21 | `est-customer-load.js` | DAH 견적서 앱 — PDF모달 / 고객불러오기 / 계약금계산 | 19 |
| 22 | `est-misc.js` | DAH 견적서 앱 — 주소검색 / 날짜포맷 / 빈상태 / 공유 / 자동저장 | 8 |

## 설문지 (survey.html) — 브라우저가 불러오는 순서대로

| # | 파일 | 역할 | 함수 수 |
|---|---|---|---|
| 1 | `survey-app.js` | DAH 설문지 앱 — React 앱 로직 | 6 |

## 그 밖의 파일 (앱 화면이 직접 불러오지 않는 것들)

| 파일 | 역할 |
|---|---|
| `apps-script-automation-hub.js` | DAH 자동화 허브 — 구글드라이브 문서저장 + 고객명단 시트 동기화 |
| `apps-script-daily-backup.js` | DAH 데이터 자동 백업 → 구글 드라이브 |
| `apps-script-survey-to-customer.js` | 드로잉엣홈 DAH — Apps Script |
| `html2pdf.bundle.min.js` | ! For license information please see html2pdf.bundle.min.js.LICENSE.txt |
| `sw.js` | DAH Service Worker — 자가 제거 (self-destruct) |

> `apps-script-*.js` 는 구글 Apps Script 편집기에 **직접 붙여넣어야** 실제로 반영돼요(GitHub에 올리는 것만으론 안 바뀜).

## 함수 찾기 (알파벳순)

| 함수 | 파일 |
|---|---|
| `_copySelectValues` | `est-product-calc.js` |
| `_doRetryEstPendingSync` | `est-sync-queue.js` |
| `_doShareEstimatePDF` | `est-customer-load.js` |
| `_estPostReceipt` | `est-save.js` |
| `_estQueueReceipt` | `est-save.js` |
| `_exportEstimatesExcelInner` | `dash-export.js` |
| `_exportExcelInner` | `dash-export.js` |
| `_findSameSpaceInsertPoint` | `est-product-calc.js` |
| `_getDragAfterRow` | `est-product-calc.js` |
| `_getSupabaseRealtimeClient` | `dash-realtime.js` |
| `_handleRealtimeCustomerChange` | `dash-realtime.js` |
| `_openAlimtalkPreview` | `dash-customer-alim.js` |
| `_openPdfModalNow` | `est-customer-load.js` |
| `_reRenderVisibleListScreen` | `dash-realtime.js` |
| `_saveEstimateInner` | `est-save.js` |
| `_savePendingSyncQueue` | `dash-sync-queue.js` |
| `_saveStage_customers` | `est-save-stages.js` |
| `_saveStage_estimates` | `est-save-stages.js` |
| `_saveStage_estimatesActual` | `est-save-stages.js` |
| `_saveStage_localStorage` | `est-save-stages.js` |
| `_setPrintTitleAndPrint` | `est-customer-load.js` |
| `_shareEstimatePDFNow` | `est-customer-load.js` |
| `_showRealtimeUpdateBanner` | `dash-realtime.js` |
| `_showRequestPreview` | `est-doc-request.js` |
| `addBlindRow` | `est-calc-blind.js` |
| `addCurtainRow` | `est-calc-curtain.js` |
| `AddCustomerModal` | `dash-customer-add.js` |
| `addOtherItemRow` | `est-calc-svc.js` |
| `addSvcRow` | `est-calc-svc.js` |
| `addToEstPendingQueue` | `est-sync-queue.js` |
| `addToPendingSyncQueue` | `dash-sync-queue.js` |
| `App` | `survey-app.js` |
| `appendPasswordResetFlow` | `dash-settings.js` |
| `applyDiscountItems` | `est-calc-rules.js` |
| `applyFrozenBreakdown` | `est-product-calc.js` |
| `applyPermissions` | `dash-auth.js` |
| `applyRealDepositToForm` | `est-utils.js` |
| `applyVendorArrivalDefaults` | `est-doc-vendor.js` |
| `archiveEstimate` | `dash-api-writes.js` |
| `ASSection` | `dash-customer-as.js` |
| `autoAddBlindSvc` | `est-calc-blind.js` |
| `autoAddSvcFee` | `est-calc-svc.js` |
| `autoSave` | `est-misc.js` |
| `autoUpdateRail` | `est-calc-curtain.js` |
| `backupData` | `dash-export.js` |
| `blindInstallSpec` | `est-calc-rules.js` |
| `btn` | `dash-ui-helpers.js` |
| `buildCustomerHTML` | `est-doc-customer.js` |
| `buildRequestHTML` | `est-doc-request.js` |
| `buildVendorDocForOne` | `est-doc-vendor.js` |
| `buildVendorHTML` | `est-doc-vendor.js` |
| `calcAutoDeposit` | `est-calc-rules.js` |
| `calcBlindBillableSqm` | `est-calc-rules.js` |
| `calcBlindRow` | `est-calc-blind.js` |
| `calcCurtainRow` | `est-calc-curtain.js` |
| `calcDeposit` | `est-customer-load.js` |
| `calcDepositAndBalance` | `est-calc-rules.js` |
| `calcDepositRatio` | `est-calc-rules.js` |
| `calcGrandBeforeTruncation` | `est-calc-rules.js` |
| `calcOtherItemRow` | `est-calc-svc.js` |
| `calcPerformanceRevenue` | `est-calc-rules.js` |
| `calcRailJa` | `est-calc-rules.js` |
| `calcSuggestedPanels` | `est-calc-rules.js` |
| `calcSvcRow` | `est-calc-svc.js` |
| `calcTotal` | `est-product-calc.js` |
| `categorizeSvcRow` | `est-calc-svc.js` |
| `changeStage` | `dash-customer-detail-tabs.js` |
| `changeStageByName` | `dash-kanban.js` |
| `checkDuplicate` | `dash-ui-helpers.js` |
| `Chip` | `survey-app.js` |
| `claimCustomer` | `dash-api-writes.js` |
| `claimUnassignedCustomer` | `dash-render.js` |
| `classifySvcRow` | `est-calc-rules.js` |
| `cleanupJunkCustomerRows` | `apps-script-automation-hub.js` |
| `cleanupJunkDriveDocuments` | `apps-script-automation-hub.js` |
| `clearAuthSession` | `dash-supabase-auth.js` |
| `clearCustomerDataCache` | `dash-auth.js` |
| `clearDraft` | `est-misc.js` |
| `clearFieldError` | `dash-ui-helpers.js` |
| `closeAdd` | `dash-customer-add.js` |
| `closeCustLoad` | `est-customer-load.js` |
| `closeDetail` | `dash-customer-detail-tabs.js` |
| `closePdfModal` | `est-customer-load.js` |
| `closeSpacePicker` | `est-form-controls.js` |
| `collectFormData` | `est-misc.js` |
| `collectLineItems` | `est-misc.js` |
| `collectVendorGroups` | `est-doc-vendor.js` |
| `confirmPdfPrint` | `est-customer-load.js` |
| `confirmPdfPrint_fitAsCanvas` | `est-customer-load.js` |
| `copyBlindRow` | `est-calc-blind.js` |
| `copyCurtainRow` | `est-calc-curtain.js` |
| `copyOtherItemRow` | `est-calc-svc.js` |
| `copySvcRow` | `est-calc-svc.js` |
| `csvSafeCell` | `dash-export.js` |
| `curtainHeightFeeWarning` | `est-calc-rules.js` |
| `customerToDbRow` | `dash-api-data.js` |
| `dahCheckClientErrors` | `apps-script-daily-backup.js` |
| `dahCheckCustomerPaymentMismatch` | `apps-script-daily-backup.js` |
| `dahCleanupTestData` | `apps-script-daily-backup.js` |
| `dahDailyBackup` | `apps-script-daily-backup.js` |
| `dahDataIntegrityScanOnly` | `apps-script-daily-backup.js` |
| `dahDiagnoseSchema` | `apps-script-daily-backup.js` |
| `dahDuplicateScanOnly` | `apps-script-daily-backup.js` |
| `dahPeekBackup` | `apps-script-daily-backup.js` |
| `dahPeekRawName` | `apps-script-daily-backup.js` |
| `dahRestoreDrill` | `apps-script-daily-backup.js` |
| `dahSafeScan` | `apps-script-daily-backup.js` |
| `dahScanForDataIntegrity` | `apps-script-daily-backup.js` |
| `dahScanForDuplicates` | `apps-script-daily-backup.js` |
| `dahScanForMissingTriggers` | `apps-script-daily-backup.js` |
| `daysBetween` | `dash-customer-alim.js` |
| `daysDiff` | `dash-utils.js` |
| `dbRowToCustomer` | `dash-api-data.js` |
| `deleteCustomer` | `dash-customer-detail-tabs.js` |
| `delRow` | `est-product-calc.js` |
| `delSvcRow` | `est-calc-svc.js` |
| `dismissFailedSave` | `dash-failed-saves.js` |
| `displaySurvey` | `est-survey.js` |
| `div` | `dash-ui-helpers.js` |
| `doGet` | `apps-script-automation-hub.js`, `apps-script-daily-backup.js` |
| `doPost` | `apps-script-automation-hub.js` |
| `el` | `dash-ui-helpers.js` |
| `enableManualBaseAddr` | `shared-common-utils.js` |
| `ensureEstimateSavedThen` | `est-save.js` |
| `escHtml` | `shared-common-utils.js` |
| `estCheckOpenMismatch` | `est-save.js` |
| `estCollectFormSnapshot` | `est-save.js` |
| `estFlushReceiptQueue` | `est-save.js` |
| `estimateDbRowToLocal` | `dash-api-data.js` |
| `estimateNeedsSave` | `est-save.js` |
| `estSendReceipt` | `est-save.js` |
| `exportEstimatesExcel` | `dash-export.js` |
| `exportExcel` | `dash-export.js` |
| `fetchDiscountCouponsFromCloud` | `est-utils.js` |
| `fetchLatestUpdatedAt` | `shared-optimistic-lock.js` |
| `fetchNewSurveys` | `apps-script-survey-to-customer.js` |
| `fetchRegionFeesFromCloud` | `est-utils.js` |
| `fetchUsedCouponIdsFromCloud` | `dash-api-settings.js` |
| `fetchVendorListFromCloud` | `est-utils.js` |
| `fetchWithRetry` | `shared-optimistic-lock.js` |
| `FieldLabel` | `survey-app.js` |
| `fillAlimTemplate` | `dash-customer-alim.js` |
| `filterCustLoad` | `est-customer-load.js` |
| `filterForStaffWithUnassigned` | `dash-utils.js` |
| `filterPipe` | `dash-kanban.js` |
| `findCurrentDetailCustomer` | `dash-customer-detail.js` |
| `findExistingCustomerByPhone` | `apps-script-survey-to-customer.js` |
| `fmt` | `dash-utils.js` |
| `fmtPhone` | `dash-utils.js`, `est-form-controls.js` |
| `fmtPrice` | `est-utils.js` |
| `fmtPriceBlur` | `est-utils.js` |
| `fmtPriceFocus` | `est-utils.js` |
| `formatAuditEvent` | `dash-settings.js` |
| `formatDate` | `apps-script-survey-to-customer.js` |
| `formatKoreanDate` | `est-utils.js` |
| `formatPhone` | `dash-ui-helpers.js` |
| `formatPhoneDigits` | `shared-common-utils.js` |
| `getAlimSentMap` | `dash-customer-alim.js` |
| `getAllEstPays` | `dash-utils.js` |
| `getAuthSession` | `dash-supabase-auth.js` |
| `getAuthToken` | `dash-supabase-auth.js` |
| `getAutoMaterialVendorName` | `est-utils.js` |
| `getAutoProductionVendorName` | `est-utils.js` |
| `getBlindMinSqm` | `est-calc-rules.js` |
| `getCalEvents` | `dash-calendar.js` |
| `getChosung` | `dash-search.js` |
| `getCustomerCurrentStage` | `dash-customer-detail.js` |
| `getCustomerOrderStatus` | `est-utils.js` |
| `getDateFilterRange` | `dash-search.js` |
| `getDefaultShapeProcessChecked` | `est-utils.js` |
| `getDiscountCoupons` | `dash-api-settings.js` |
| `getDisplayStageLabel` | `dash-utils.js` |
| `getDueAlimKeys` | `dash-customer-alim.js` |
| `getEstPendingQueue` | `est-sync-queue.js` |
| `getFailedSaveEntries` | `dash-failed-saves.js` |
| `getLatestEstPay` | `dash-utils.js` |
| `getLeadStaleDays` | `dash-api-settings.js` |
| `getMasterEmail` | `dash-supabase-auth.js` |
| `getMempoPhrases` | `dash-memo.js` |
| `getMonthContractCount` | `dash-chart.js` |
| `getMonthPerformanceRevenue` | `dash-chart.js` |
| `getMonthRevenue` | `dash-chart.js` |
| `getMonthStaffPerformance` | `dash-chart.js` |
| `getOrCreateCustomerSheet` | `apps-script-automation-hub.js` |
| `getPendingSyncQueue` | `dash-sync-queue.js` |
| `getPriceVal` | `est-utils.js` |
| `getReceivedAmount` | `dash-utils.js` |
| `getReceivedSummary` | `dash-utils.js` |
| `getRegionFees` | `shared-common-utils.js` |
| `getRegionFromAddr` | `dash-calendar.js` |
| `getRelevantOrderItems` | `dash-customer-order.js` |
| `getSettings` | `dash-settings.js` |
| `getStaffBadgeColor` | `dash-utils.js` |
| `getStaffEmail` | `dash-api-settings.js` |
| `getStaffEmailMap` | `dash-api-settings.js` |
| `getStaffList` | `dash-api-settings.js` |
| `getUnpaidAmount` | `dash-utils.js` |
| `getVendorInfoIssues` | `est-doc-vendor.js` |
| `getVendorList` | `dash-api-settings.js` |
| `goTab` | `dash-core.js` |
| `guessContextVars` | `dash-customer-alim.js` |
| `hasCurtainOrBlindItem` | `est-utils.js` |
| `hasIncompleteOrder` | `dash-customer-order.js` |
| `hasOrderDataGap` | `dash-customer-order.js` |
| `hideLoading` | `dash-ui-helpers.js` |
| `hideQuickNav` | `dash-ui-helpers.js` |
| `insertCustomer` | `apps-script-survey-to-customer.js` |
| `isAlimDueNow` | `dash-customer-alim.js` |
| `isArchived` | `dash-utils.js` |
| `isLegacyNoPaymentRecord` | `dash-chart.js` |
| `isNoInstallFee` | `est-calc-rules.js` |
| `isOrderItemDone` | `dash-customer-order.js` |
| `isSoftDeleted` | `dash-utils.js` |
| `joinCustomerPresence` | `dash-realtime.js` |
| `labelDiv` | `dash-settings.js` |
| `leaveCustomerPresence` | `dash-realtime.js` |
| `loadAppSettingsAsync` | `dash-api.js` |
| `loadCustByIdx` | `est-customer-load.js` |
| `loadCustomers` | `dash-api-data.js` |
| `loadCustomersAsync` | `dash-api-data.js` |
| `loadDaumPostcode` | `shared-common-utils.js` |
| `loadDraft` | `est-misc.js` |
| `loadEstimateForPublicView` | `est-public-view.js` |
| `loadEstimatesAsync` | `dash-api-data.js` |
| `loadSettings` | `dash-settings.js` |
| `loadSurveyFromSheet` | `est-survey.js` |
| `lockEstimateForm` | `est-form-controls.js` |
| `logEvent` | `dash-api.js` |
| `loginAs` | `dash-auth.js` |
| `logout` | `dash-auth.js` |
| `logSaveAttempt` | `est-save.js` |
| `logSaveStage` | `est-save.js` |
| `makeRowDraggable` | `est-product-calc.js` |
| `markSurveyProcessed` | `apps-script-survey-to-customer.js` |
| `markSvcManualOverride` | `est-calc-svc.js` |
| `newEstimate` | `est-save.js` |
| `openAdd` | `dash-customer-add.js` |
| `openCustomDatePicker` | `dash-calendar.js` |
| `openCustomerLoad` | `est-customer-load.js` |
| `openDetail` | `dash-customer-detail.js` |
| `openDetailInner` | `dash-customer-detail.js` |
| `openEstimate` | `dash-customer-estimates.js` |
| `openFailedSavesModal` | `dash-failed-saves.js` |
| `openInstallerInfoModal` | `est-doc-request.js` |
| `openKakaoAddr` | `shared-common-utils.js` |
| `openPdfModal` | `est-customer-load.js` |
| `openSpacePicker` | `est-form-controls.js` |
| `openVendorInfoInputModal` | `est-doc-vendor-ui.js` |
| `openVendorOrderPicker` | `est-doc-vendor-ui.js` |
| `pad2` | `dash-utils.js` |
| `parkLead` | `dash-api-writes.js` |
| `parkLeadFromHome` | `dash-render.js` |
| `parseProductString` | `est-customer-load.js` |
| `parseRecoveryTokenFromUrl` | `dash-supabase-auth.js` |
| `permanentlyDeleteCustomer` | `dash-customer-detail-tabs.js` |
| `permanentlyDeleteCustomerFromDb` | `dash-api-writes.js` |
| `pickCustomSpace` | `est-form-controls.js` |
| `pickSpace` | `est-form-controls.js` |
| `printForCustomer` | `est-doc-customer.js` |
| `printForVendor` | `est-doc-vendor-ui.js` |
| `printRequest` | `est-doc-request.js` |
| `processNewSurveys` | `apps-script-survey-to-customer.js` |
| `ProgressBar` | `survey-app.js` |
| `railInstallSpec` | `est-calc-rules.js` |
| `railMaterialSpec` | `est-calc-rules.js` |
| `recalcBlindOptionExtras` | `est-calc-blind.js` |
| `refreshAlimSentMapFromServer` | `dash-customer-alim.js` |
| `refreshAuthSessionForce` | `dash-supabase-auth.js` |
| `refreshAuthSessionIfNeeded` | `dash-supabase-auth.js` |
| `refreshBlindVendorOptions` | `est-calc-blind.js` |
| `regionFeeContent` | `est-calc-rules.js` |
| `regionFeeHint` | `est-calc-rules.js` |
| `removeFailedSaveEntry` | `dash-failed-saves.js` |
| `removeFromPendingSyncQueue` | `dash-sync-queue.js` |
| `removeStaffEmail` | `dash-api-settings.js` |
| `renderAlimSection` | `dash-customer-alim.js` |
| `renderASSection` | `dash-customer-as.js` |
| `renderCal` | `dash-calendar.js` |
| `renderCalList` | `dash-calendar.js` |
| `renderChart` | `dash-chart.js` |
| `renderChartStaffRank` | `dash-chart.js` |
| `renderConfirmBadge` | `est-form-controls.js` |
| `renderCouponList` | `est-utils.js` |
| `renderCustLoadList` | `est-customer-load.js` |
| `renderDetailBottomButtons` | `dash-customer-detail-tabs.js` |
| `renderDetailEstTab` | `dash-customer-estimates.js` |
| `renderDetailEstTabInner` | `dash-customer-estimates.js` |
| `renderDetailHeader` | `dash-customer-detail.js` |
| `renderDetailInfoSection` | `dash-customer-detail-tabs.js` |
| `renderDetailStageSection` | `dash-customer-detail.js` |
| `renderDetailTodoSection` | `dash-customer-detail-tabs.js` |
| `renderEmptyState` | `est-misc.js` |
| `renderEstimateHistory` | `dash-customer-estimates.js` |
| `renderEstList` | `dash-render-est.js` |
| `renderFailedSavesBanner` | `dash-failed-saves.js` |
| `renderGoalProgress` | `dash-render.js` |
| `renderHome` | `dash-render.js` |
| `renderKakaoLog` | `dash-customer-alim.js` |
| `renderKanbanCols` | `dash-kanban.js` |
| `renderOrderSection` | `dash-customer-order.js` |
| `renderPaySection` | `dash-customer-pay.js` |
| `renderPipe` | `dash-kanban.js` |
| `renderPipeKanban` | `dash-kanban.js` |
| `renderPresenceBanner` | `dash-realtime.js` |
| `renderPublicViewFromRow` | `est-public-view.js` |
| `renderQuickNav` | `dash-ui-helpers.js` |
| `renderSearch` | `dash-render-search.js` |
| `renderSettings` | `dash-settings.js` |
| `renderSettingsCouponGroup` | `dash-settings-sections.js` |
| `renderSettingsDataGroup` | `dash-settings-sections.js` |
| `renderSettingsIntegrationGroup` | `dash-settings-sections.js` |
| `renderSettingsMemoLeadGroup` | `dash-settings-sections.js` |
| `renderSettingsRegionFeesGroup` | `dash-settings-sections.js` |
| `renderSettingsVendorGroup` | `dash-settings-sections.js` |
| `renderStaffBadge` | `dash-utils.js` |
| `renderStaffLoginList` | `dash-auth.js` |
| `renderSvcSummary` | `est-calc-svc.js` |
| `renderWorkStatusCards` | `est-utils.js` |
| `resetEstEditingState` | `est-save.js` |
| `resolveRegionPrices` | `est-calc-rules.js` |
| `restoreAppliedDiscounts` | `est-utils.js` |
| `restoreCustomer` | `dash-customer-detail-tabs.js` |
| `restoreCustomerFromDb` | `dash-api-writes.js` |
| `restoreLineItemsToForm` | `est-customer-load.js` |
| `retryEstPendingSync` | `est-sync-queue.js` |
| `retryFailedSave` | `dash-failed-saves.js` |
| `retryPendingSurveys` | `survey-app.js` |
| `retryPendingSync` | `dash-sync-queue.js` |
| `runSelfDiagnosis` | `est-save.js` |
| `saveAuthSession` | `dash-supabase-auth.js` |
| `saveCustomers` | `dash-api-data.js` |
| `saveCustomerToDb` | `dash-api-writes.js` |
| `saveDocumentFile` | `apps-script-automation-hub.js` |
| `saveDocumentToDrive` | `est-utils.js` |
| `saveEstimate` | `est-save.js` |
| `saveSettings` | `dash-settings.js` |
| `sbSyncSetting` | `dash-api.js` |
| `sbXHR` | `dash-api.js` |
| `searchMatch` | `dash-search.js` |
| `selectPdfOpt` | `est-customer-load.js` |
| `sendAlimtalk` | `dash-customer-alim.js` |
| `sendPasswordResetEmail` | `dash-supabase-auth.js` |
| `setAsFee` | `est-form-controls.js` |
| `setCustType` | `est-form-controls.js` |
| `setDateFilter` | `dash-search.js` |
| `setDepositAuto` | `est-customer-load.js` |
| `setDiscountCoupons` | `dash-api-settings.js` |
| `setEstArchiveFilter` | `dash-render-est.js` |
| `setLastLoginEmail` | `dash-supabase-auth.js` |
| `setLeadStaleDays` | `dash-api-settings.js` |
| `setMasterEmail` | `dash-supabase-auth.js` |
| `setMemoPhrasesList` | `dash-memo.js` |
| `setRegionFees` | `dash-api-settings.js` |
| `setSort` | `dash-kanban.js` |
| `setStaffEmail` | `dash-api-settings.js` |
| `setStageFilter` | `dash-kanban.js` |
| `setStatus` | `est-form-controls.js` |
| `setupRowDragReorder` | `est-product-calc.js` |
| `setVendorList` | `dash-api-settings.js` |
| `shareEstimatePDF` | `est-customer-load.js` |
| `showAuditLogModal` | `dash-settings.js` |
| `showAutoSaveIndicator` | `est-misc.js` |
| `showEstimateHistoryModal` | `dash-customer-estimates.js` |
| `showEstimatePickerModal` | `dash-customer-estimates.js` |
| `showFieldError` | `dash-ui-helpers.js`, `est-save.js` |
| `showLoading` | `dash-ui-helpers.js` |
| `showPublicViewContent` | `est-public-view.js` |
| `showPublicViewError` | `est-public-view.js` |
| `showPublicViewLoading` | `est-public-view.js` |
| `showRequestFromEstimate` | `dash-customer-estimates.js` |
| `showStageMenu` | `dash-kanban.js` |
| `showToast` | `shared-common-utils.js` |
| `showVendorOrderFromEstimate` | `dash-customer-estimates.js` |
| `sortCustomers` | `dash-kanban.js` |
| `span` | `dash-ui-helpers.js` |
| `splitCustomerPayments` | `dash-chart.js` |
| `splitStoredAddr` | `shared-common-utils.js` |
| `stageColorFor` | `dash-customer-detail.js` |
| `startAuthAutoRefresh` | `dash-supabase-auth.js` |
| `startRealtimeSync` | `dash-realtime.js` |
| `stopAuthAutoRefresh` | `dash-supabase-auth.js` |
| `stopRealtimeSync` | `dash-realtime.js` |
| `summarizeBlindOptionExtras` | `est-calc-rules.js` |
| `summarizeSvcDetails` | `est-calc-rules.js` |
| `summarizeSvcGroups` | `est-calc-rules.js` |
| `supabaseAuthLogin` | `dash-supabase-auth.js` |
| `switchDetailTab` | `dash-customer-detail.js` |
| `syncCustomerRow` | `apps-script-automation-hub.js` |
| `syncCustomerToSheet` | `shared-common-utils.js` |
| `syncStaffGoalsToCloud` | `dash-api.js` |
| `testInsert` | `apps-script-survey-to-customer.js` |
| `testProcessSurveys` | `apps-script-survey-to-customer.js` |
| `testSaveDocument` | `apps-script-automation-hub.js` |
| `testSyncCustomer` | `apps-script-automation-hub.js` |
| `TextInput` | `survey-app.js` |
| `thisMonthStr` | `dash-utils.js` |
| `todayStr` | `dash-utils.js` |
| `toggleConfirmEstimate` | `est-form-controls.js` |
| `toggleDateTbd` | `est-form-controls.js` |
| `toggleHomeAccordion` | `dash-render.js` |
| `toggleInnerFields` | `est-product-calc.js` |
| `toggleInternal` | `est-form-controls.js` |
| `toggleSvcDetail` | `est-calc-svc.js` |
| `triggerSumPulse` | `est-product-calc.js` |
| `truncateToThousand` | `est-calc-rules.js` |
| `unfreezeEstimateIfEditing` | `est-misc.js` |
| `unparkLead` | `dash-api-writes.js` |
| `updateEstSyncBanner` | `est-sync-queue.js` |
| `updateOrderStatus` | `est-utils.js` |
| `updateOrderStatusFromVendorGroups` | `est-utils.js` |
| `updatePasswordWithRecoveryToken` | `dash-supabase-auth.js` |
| `updateSyncBanner` | `dash-sync-queue.js` |
| `validateDate` | `dash-ui-helpers.js` |
| `validateEstimate` | `est-save.js` |
| `validateName` | `dash-ui-helpers.js` |
| `validatePhone` | `dash-ui-helpers.js` |
| `vendorCategory` | `est-utils.js` |
| `verifyRecoveryCode` | `dash-supabase-auth.js` |
| `wireVendorNameEdit` | `est-doc-vendor-ui.js` |
