# 24-implementation.md — v2 구현 현황 (MVP 슬라이스)

> `docs/spec/` 설계(00-canon ~ 23)를 토대로 구현한 **동작하는 MVP 슬라이스**의 현황·아키텍처·검증·한계.
> 실행 가능·테스트 통과 상태를 우선해 인메모리 저장소로 구현하고, 정본 DB 설계는 ERD(11)로 고정.

## 1. 한눈에

- **스택**: Next.js 14(App Router) + React 18 + TypeScript(strict) + Tailwind. 저장소는 **인메모리**(외부계정 불필요, 즉시 실행).
- **범위**: canon §의 MVP 슬라이스 — 멀티테넌트 기반 + 회원·상담CRM·수업·예약·출결·수강권·결제·환불·미수·**이중기준 손익**·비용·**통장/카드 매칭**·관리자/수익분석 대시보드·감사로그.
- **검증**: 타입체크 0 · 유닛 39(규칙 22 + 통합 17) · HTTP 스모크 12 · Playwright 브라우저 8 — 전부 GREEN.

## 2. 아키텍처 (레이어)

```
src/
  domain/     도메인 타입 — enums.ts(§3 enum 21종) · policy.ts(§6) · entities.ts(§2 42테이블)
  rules/      순수 규칙(스토어 무의존, 단위테스트) — deduction · booking · revenue · refund
  biz/        서비스(컨텍스트 위에서 규칙+감사 조합)
              context(테넌시 스코프) · audit · authz(RBAC) ·
              member · lead(CRM) · class · reservation · pass · revenue ·
              expense · matching · dashboard · notification
  lib/        util(금액·날짜·ID)
  data/       db.ts(인메모리 DB 타입) · seed.ts(서비스로 정합 시드)
  server/     db2.ts(싱글톤 + RequestContext 팩토리)
app/          (console) 운영·재무 화면 + (member) 회원 모바일웹 + actions.ts(서버액션)
```

- **격리**: 모든 테넌트 데이터 접근은 `scoped(ctx, ...)`로 `tenant_id+studio_id` 필터(canon §1.2/§5).
- **감사**: 발급/예약/출결/환불/차감/매칭이 `audit_logs`에 append-only 기록(canon §1).
- **DB 교체 지점**: `src/data/db.ts`(인메모리)를 Prisma/Postgres 구현으로 교체하면 서비스 인터페이스 그대로 프로덕션 전환.

## 3. 차별화 구현 — 이중 손익 (canon §4)

- 한 결제 → `revenue_records`에 **결제기준 1건**(`payment`, 실수령액). 미수는 미인식, **입금 매칭 시 인식**(`matchingService.matchBankToPayment`).
- 수강권 차감 1건 → **소진기준 1건**(`consumption`, 단가=결제액/총횟수, 수업유형·강사 귀속). 취소/폐강 복구 시 **음수 소진**으로 상쇄.
- 환불 → **결제기준 음수 1건**(토글 무관).
- 대시보드는 `basis` 토글로 **기준별로만 합산**(중복 합산 금지). 수업유형/강사 수익성은 소진기준에서만 노출.

## 4. 화면 (구현)

운영 콘솔: 대시보드(4영역+기준토글) · 타임테이블(+세션 상세 모달, 인터셉트 라우트) · 회원목록 · 회원360° ·
상담 CRM(칸반+전환율) · 손익·비용 · **거래 매칭**(입금 추천·자동분류·규칙학습) · 수익분석(이중기준·월말예상·수익성 분해).
회원 모바일웹: 예약(자격검증·대기) · 마이페이지(수강권·예약·출석).

## 5. 검증 (재현)

```bash
npm run typecheck                         # 타입체크
npm test                                  # 유닛 39 (tests/v2)
npm run build && npx next start -p 3100   # 프로덕션 기동
E2E_BASE=http://localhost:3100 npm run e2e   # HTTP 스모크 12
npx playwright test                       # 브라우저 플로우 8
```

핵심 회계 단언(통합 테스트): 결제기준 순매출 1,450,000 · 소진기준 110,000 · 미수금 300,000 ·
미입금 카드매출(수수료 차감) · 비용 2,520,000(고정 임대료 / 변동 강사·광고·공과) · 입금매칭 후 미수 0 + 매출 인식 · 환불 음수 반영.

## 6. 알려진 한계 (후속)

- **저장소**: 인메모리(데모). 프로덕션은 Prisma/Postgres + 마이그레이션(11-erd 기준).
- **인증/RBAC 시행**: `authz.ts`에 canon §5 매트릭스를 구현했으나, 데모는 단일 owner 컨텍스트(`getContext`)로 동작 — 실제 enforcement(세션·역할별 차단)는 인증 연동과 함께 적용 예정.
- **알림**: 발송 이력만 기록(실 SMS/알림톡 미연동).
- **금융연동**: CSV 인입은 인메모리 모의(실 오픈뱅킹/카드매출 조회는 2·3차).
- **미구현 모듈(설계만)**: 강사 정산(settlements) 화면, 운동일지, 재무 리포트 내보내기, SaaS 과금 콘솔.

### 6.1 적대적 코드리뷰 결과 (1회차 — 전건 반영)
자기비평(29건 검토 → **27건 확정**: critical 4·high 7·medium 10·low 6)을 **전부 반영**했다. 주요 수정:
- **결석 차감 매핑·지각취소 사유** 교정(canon §14 매트릭스), **1일 한도**(대기 제외), **대기 자동전환 재검증**.
- **이중손익 정합**: 분할 입금 1회 인식, 미수금 산식(입금대기 제외), 환불액 결제기준 한정, 소진 복구 `refund` 구분, 대체강사 귀속.
- **단가 라운딩 잔차 보정**(`consumptionAmount`): 누적 인식 목표 차이로 계산해 비정수 단가도 소진 총합=결제액 보장(테스트 잠금).
- **매출 인식 시점 정책**: `revenue_recognition`(on_paid/on_deposit) 연동.
- **신규/재등록 귀속**: 발급 시 결제에 스냅샷(`payments.is_new_member`/`is_re_enroll`) → 입금 지연 인식 시 복원.
- **멀티테넌트 격리**: `scopedFind` 로 전 서비스 조인 23곳 스코프화, 상품 조회 테넌트 필터.
- **RBAC 시행**: 서비스/액션 권한 게이트 + 회원 본인 격리 + 강사 통장잔액 마스킹(`tests/v2/rbac.test.ts`).
- **감사·정합**: 매칭/태그 audit, 월말 현금 회수율 보수화, `is_active` 네이밍·라벨 정합.

### 6.2 2회차 심층 자기비평 (1차보다 깊게 — 멱등성·불변식 중심)
2회차(53건 검토 → **38건 확정**: critical 3·high 11·medium 17·low 7) — 33건 반영:
- **멱등성/재진입(critical)**: 출결 전이 `booked` 상태 가드(이중 출석→차감 반전·중복 행 차단) · 입금 매칭 `is_matched`/방향 가드(매출 이중 인식 차단) · 폐강 멱등.
- **환불 정합(critical)**: 멱등 가드 + **실수령액 캡**(미수분 환불 불가) + 잔여 회수 **원장 기록**(append-only 불변식) + 기간권 remaining 보존.
- **상태/권한**: 출결 운영자 전용(회원 차단) + transition/closeSession/createSession/createLead/advanceLead/createMember/updateMember/setTag/addCounselingLog에 `assertCan` 게이트 · 취소 가능상태 가드 + 대기열 정리 + 취소 후 재검증.
- **재무 표기 정합**: 소진기준 P&L도 `gross − refund = net` 성립(basisRefund) · 미수회원 산식 일치 · 잔여 음수 방지.
- **지표/예측**: 전환율 기간·`trial_done` 선행 스코프 · LTV를 ARPU와 구분(유지개월) · 예측에 ym 전달 + 최소 경과일 가드 · 테넌트 스코프(notify/expiring).
- **매칭**: 규칙 우선순위 asc+구체성 정렬 · 학습 규칙 업서트(중복 방지) · 금액 graduated 점수 · depositor 양방향 · 대사로그 staff_id 해석.
- **에러 UX**: 콘솔/회원 라우트 error boundary(권한·검증 오류 친화적 표시).

**2회차 남은 후속(기능 추가/설계 의존)**: 카드매출 3단계 대사(approved→captured→deposited, `matchBankToCardSale`) · 사유결석(excused)/지각(late) 출결 처리 · 입금 초과분 명시 처리.

### 6.3 3회차 자기비평 (새 축 — 동시성·성능·검증·a11y·i18n·스키마·UX·관측·테스트)
3회차(68건 검토 → **43건 확정**: critical 0·high 3·medium 22·low 18) — 새 축이라 정합/멱등은 이미 소진, 폴리시·하드닝 위주. 22건 반영:
- **입력 검증/보안(high·med)**: 할인 금액 검증(음수·정가초과 → 음수 매출 차단, ERD CHECK/QA-PAY-07) · 서버액션 금액 정수·이벤트 화이트리스트·날짜 형식 검증 · 매칭 규칙 **정규식 패턴 길이 제한(ReDoS 완화)** · `/api/reset` 프로덕션 오프스위치 · 감사로그 비밀필드 마스킹.
- **스키마(high)**: `prisma/schema.prisma` 를 **v2 정본으로 전면 재작성**(42모델·snake_case·tenant_id/studio_id·소프트삭제·canon enum, `prisma validate` 통과) — v1 잔재(16모델 camelCase studio-rooted) 제거.
- **접근성**: 공용 Modal 포커스 트랩·초기/복귀 포커스·`aria-labelledby`·ESC, 폼 컨트롤 `aria-label`(검색·카테고리).
- **성능**: listMembers 회원당 수강권 1회 계산.
- **UX**: 무제한권 라벨('무제한'), 유효 수강권 없을 때 예약 버튼 비활성, 만료일 중복 표기 정리.
- 잠금 테스트(`tests/v2/validation.test.ts`): 할인 경계·ReDoS·폐강 복구.

### 6.4 폴리시 백로그 일괄 정리 (a11y · i18n · 성능)
3회차 보류 백로그 중 고가치 항목 반영:
- **a11y**: `Stat` 대비비 상향(neutral-500) + 색상단독 탈피(▲/▼/⚠ 기호 병기) · 테이블 헤더 `scope="col"`(15개) · 폼 `aria-label` · Modal 포커스 트랩(3회차).
- **i18n**: `won()` 단일 출처화(중복 제거) · 타임테이블 주간을 `ctx.now` 기준 동적 계산(하드코딩 제거).
- **성능**: `getTimetable` 룩업 맵으로 N+1 제거 · `listMembers` 수강권 1회 계산 · (프로덕션 집계는 Prisma 인덱스 기반 SQL로 위임).
- **테스트**: 학습 규칙 자동분류·할인 경계·ReDoS·폐강 복구 잠금 → 유닛 **57**.

**남은 후속(저가치/설계 의존)**: AAA 터치타깃 · 대시보드 내부 집계 메모이즈 · 타임존 저장포맷(UTC) 일괄 적용(인메모리는 KST 리터럴, Prisma는 UTC) · ERD 문서 신규필드 동기화 · 소프트삭제 쓰기경로 · 콘솔 사이드바 반응형. (`docs/spec/` 백로그)

**공통 후속(인프라 의존)**: 실제 세션 인증(OTP)(현재 콘솔=owner·회원=login-as 가정) · Prisma/Postgres 마이그레이션(스키마 v2 준비됨) · 알림 실발송 · 오픈뱅킹/카드매출 조회 · 강사 정산/운동일지 화면.

## 7. 관련 문서
[`00-canon.md`](./00-canon.md) · [`11-erd.md`](./11-erd.md) · [`14-booking-policy.md`](./14-booking-policy.md) · [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) · [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) · [`19-metrics.md`](./19-metrics.md)
