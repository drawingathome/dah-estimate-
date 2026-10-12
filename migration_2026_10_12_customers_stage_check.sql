-- 2026-10-12: 고객 단계(stage)에 허용 값 제한. 앱의 DAH_STAGE_ORDER(shared-common-utils.js)와 정확히 같은 9개.
-- 오타·이상한 값이 DB에 들어가 칸반/통계에서 사라지는 것을 막음. (NULL은 CHECK 특성상 통과 - 컬럼 기본값이 '상담')
-- 적용 전 전체 고객(보관 포함)의 단계가 모두 허용 값임을 확인함. 단계 이름을 바꾸거나 추가할 때는 이 제약도 함께 바꿀 것.
alter table public.customers add constraint customers_stage_chk check (stage in ('방문예약','상담','가견적','선금결제','실측준비중','확정견적','잔금결제','시공준비중','시공완료'));
