# 21-roadmap.md — 개발 우선순위

> **목적**: MVP → 2차 → 3차를 **마일스톤 · 스프린트**로 분해하고(에픽 → 스토리), **모듈 간 선행 의존성 그래프**, 각 단계의 **출시 정의(Definition of Done)** 와 **핵심 리스크 게이트**를 정량으로 못 박는다. 특히 수익분석(이중기준 손익 · 통장/카드 매칭)이 **MVP에서 어디까지, 2차에서 어디까지**인지 경계를 명확히 한다. 근거: [`_source-requirements.md`](./_source-requirements.md) §8·§9·§14·§17, 계약: [`00-canon.md`](./00-canon.md).

본 문서는 새 테이블·enum·정책 파라미터를 **정의하지 않는다**. 모든 테이블명·컬럼명·enum 값·역할명·카테고리명은 [`00-canon.md`](./00-canon.md)의 단일 진실원천을 글자 단위로 인용한다. 충돌 시 canon이 우선한다. 단계 범위의 1차 정의는 [`05-scope-mvp.md`](./05-scope-mvp.md)·[`06-scope-phases.md`](./06-scope-phases.md)가 소유하며, 본 문서는 그것을 **언제·어떤 순서로·무엇이 끝나야** 만드는지의 실행 계획으로 변환한다.

---

## 0. 로드맵 한눈에 보기

| 마일스톤 | 기간(상대) | 한 줄 정의 | 핵심 산출 가치 | 게이트 통과 조건(요약) |
|---|---|---|---|---|
| **M0 기반(Foundation)** | 스프린트 0 (2주) | 테넌시·인증·권한·감사 골격 | 1일차부터 멀티테넌트·RBAC·`audit_logs` | 모든 쿼리 `tenant_id` 강제, 7역할 로그인, 금전성 변경 로그 100% |
| **M1 운영 코어** | S1~S2 (4주) | 회원·수업·예약·출석·수강권 | "예약 30초, 등록 3클릭" 운영 가능 | 예약→차감→출석 1주기 무결, 모바일 웹 예약 동작 |
| **M2 정산 코어** | S3 (2주) | 결제·환불·미수금·**결제기준 매출** | 현금흐름·미수 한눈에 | `revenue_basis=payment` 손익 + 환불 음수 반영 |
| **M3 수익분석 MVP** | S4 (2주) | **소진기준 매출** + 기본 대시보드 + CSV/수동매칭 | 이중기준 손익 토글, 비용 수동입력 | `payment`/`consumption` 양 기준 동시 집계, 4영역 대시보드 |
| **— MVP 출시 게이트 —** | — | 단일 샵 내부 운영 가능 | (아래 §4 DoD) | 정합성·권한·금액 검수 통과 |
| **M4 자동화** | S5~S6 (4주) | 자동분류·자동매칭·반복비용·월말예측 | 수동 분류/매칭을 시스템이 대신 | 자동분류 정확도 ≥ 90%, 카드매출 3단계 대조 |
| **M5 수익성 심화** | S7 (2주) | 강사/수업유형/유입경로 수익성·정산·알림톡·운동일지 | 깊은 경영 인사이트 | 강사별 손익 = 소진기준 분해 일치, 알림톡 발송 |
| **M6 금융연동** | S8~S9 (4주) | 오픈뱅킹·카드매출 조회·PG·세무 내보내기 | 손 안 대는 재무 흐름 | 동기화 실패 복구, PG 결제 정합 |
| **M7 SaaS 상품화** | S10~S11 (4주) | 다지점·요금제·외부 샵 온보딩·과금 | 외부 샵 판매 | 테넌트 격리 침투테스트, 구독 과금 정확 |

> **불변 원칙(원본 §14·§15)**: **권한(RBAC) · `audit_logs` · 테넌시(`tenant_id`/`studio_id`)는 M0(1일차)부터** 들어간다. 이후 어떤 마일스톤도 이 3가지를 "나중에 붙이는" 일정이 없다. 기능을 먼저 만들고 권한/로그/테넌시를 사후 적용하는 것은 **금지된 안티패턴**이다(사후 적용 시 금전 데이터 누락·격리 구멍 발생).

---

## 1. 수익분석 — MVP vs 2차 경계 (가장 중요한 분리)

수익분석은 이 솔루션의 핵심 차별화(원본 §8·주의사항)다. "어디까지 MVP인가"를 먼저 못 박는다. 회계 산식은 [`19-metrics.md`](./19-metrics.md)가, 회계 모델은 [`00-canon.md`](./00-canon.md) §4가 소유한다.

| 수익분석 능력 | MVP(M2~M3) | 2차(M4~M5) | 3차(M6) | 근거 |
|---|---|---|---|---|
| **결제기준 손익**(`revenue_basis=payment`) | ● 완성(결제 시 `revenue_records` 1건 + 환불 음수) | 유지 | 유지 | canon §4.1 |
| **소진기준 손익**(`revenue_basis=consumption`) | ● 완성(차감 시 회차별 인식, `unit_price_amount`) | 유지 | 유지 | canon §4.2 |
| **이중기준 토글**(대시보드 basis 전환) | ● 완성 | 유지 | 유지 | [`10-profit-dashboard.md`](./10-profit-dashboard.md) |
| 환불 반영(순매출 자동 차감) | ● `source_type=refund`, `amount` 음수 | 유지 | 유지 | canon §4.1 |
| 비용 집계(고정비/변동비) | ● **수동 입력** + CSV 업로드 원천 | ◐ 자동분류로 채움 | 유지 | canon §3.13~3.14 |
| 4영역 대시보드(오늘운영/매출/비용/수익) | ● 기본 집계값 | 심화 | 유지 | 원본 §13 |
| 미수금·미입금 카드매출 표시 | ● 표시(수동 입력 기준) | ◐ 자동대조로 정확도↑ | 유지 | canon §4.4 |
| **강사별/수업유형별/유입경로별 수익성** | ✕ (데이터는 쌓되 분석 화면 미제공) | ● 완성 | 유지 | 원본 §8·§12 |
| **월말 예상 손익**(예측) | ✕ | ● 완성 | 유지 | 원본 §8·§17 |
| CAC / LTV / 재등록률 / 체험 전환율 | ◐ 원천 데이터만 적재 | ● 지표 화면 | 유지 | 원본 §8·§10 |
| 통장/카드 **자동분류·자동매칭** | ✕ (수동 매칭만) | ● 완성 | 유지 | 원본 §9 |
| 카드매출 3단계(승인/매입/입금) 대조 | ◐ 수동 등록(`reconciliation_stage` 단계 입력) | ● 자동 대조 | ● 카드사 조회 연동 | canon §3.21 |
| 오픈뱅킹·세무 리포트 내보내기 | ✕ | ✕ | ● 완성 | 원본 §9 3차 |

**경계 한 줄 요약**:
- **MVP 수익분석 = "이중기준 손익(결제/소진) + 4영역 대시보드 + 수동 비용/매칭"까지.** 이중기준 손익 엔진 자체는 **MVP에서 완성**한다(차별화의 심장이므로 미루지 않는다).
- **2차 수익분석 = "분해·예측·자동화"** — 강사/수업유형/유입경로 수익성, 월말 예측, 자동분류·자동매칭, 카드매출 자동 대조.
- **3차 = "외부 금융 데이터로 손 안 대고 채우기"** — 오픈뱅킹/카드조회/PG/세무.

> 왜 소진기준을 MVP에 넣는가? 소진기준 인식은 `pass_transactions` 차감 이벤트에 1:1로 매달리므로(canon §4.2), **예약/출석/차감 로직(M1)이 끝나면 추가 비용이 거의 없다.** 반대로 MVP에서 빼면 2차에서 과거 차감 이력을 소급 인식해야 해 정합성 리스크가 커진다. → **소진기준은 M1과 함께 들어가야 싸다.**

---

## 2. 모듈 간 선행 의존성 그래프

### 2.1 의존성 그래프(빌드 순서)

화살표 `A → B`는 "A가 B의 **선행 조건**(A 없이는 B를 완결할 수 없음)"을 뜻한다.

```
[M0 기반]
 tenants ─┬─ studios ─┬─ users ─┬─ roles ─ permissions       (RBAC)
          │           │         └─ audit_logs                 (감사: 모든 쓰기 경로가 의존)
          └────────────┴── (tenant_id/studio_id 공통 컬럼: 모든 하위 테이블의 전제)

[M1 운영 코어]
 staff ────┬───────────────────────────────────────────────┐  (강사·직원 마스터: 아래 *_staff_id 선행)
           │                                                 │
 members ──┼── leads ── counseling_logs ── marketing_sources │  (members/leads.assigned_staff_id ◄ staff)
           │                                                 │
           ├── rooms ── class_templates ── class_sessions ──┤
           │                          (instructor_staff_id ◄ staff)
 products ─┴── passes ── pass_transactions ◄──────┐          │
                  ▲                                 │          │
                  │                          reservations ◄────┘
                  │                                 │
                  └──────────── attendance ◄────────┘   (차감 트리거)
                                  └── waitlists (정원 초과 분기)

 (M2 purchases.seller_staff_id, class_sessions.substitute_staff_id 도 staff 선행)

[M2 정산 코어]
 purchases ── payments ── refunds          (purchases.seller_staff_id, payments.staff_id ◄ staff[M1])
     │            │          │
     └── passes 발급(M1 passes로 연결)  │
                  └──────────────┴──► revenue_records (revenue_basis=payment)

[M3 수익분석 MVP]
 pass_transactions(차감) ──► revenue_records (revenue_basis=consumption)
 expense_categories ── expense_records(수동) ──┐
 bank_transactions(CSV) ── card_expenses(CSV) ─┤ (수동 매칭)
                                               └──► [대시보드 4영역 집계]
 financial_reports(기본 월집계)

[M4 자동화]   transaction_matching_rules ── transaction_reconciliation_logs
              card_sales(3단계) ── bank_transactions 매칭
[M5 수익성]   settlements / instructor_comments / exercise_logs / notifications(알림톡)
[M6 금융]     external_integrations ── sync_logs ── (오픈뱅킹/PG/카드/홈택스)
[M7 SaaS]     subscription_plans ── tenant_subscriptions ── (다지점·온보딩·과금)
```

### 2.2 임계 경로(Critical Path)

가장 길고 양보 불가한 빌드 사슬. 이 사슬이 늦으면 MVP 전체가 늦는다.

```
tenants/studios/users/RBAC/audit_logs
  → staff(강사·직원 마스터) → members → products/passes → class_sessions → reservations → pass_transactions(차감)
  → attendance → payments → revenue_records(payment) → revenue_records(consumption) → 대시보드
```
> `staff`는 `class_sessions.instructor_staff_id`·`purchases.seller_staff_id`·`members/leads.assigned_staff_id`의 공통 선행이라 M1 진입 직후(또는 members와 병렬) 완성되어야 한다.

| 임계 노드 | 왜 임계인가 | 막히면 영향 |
|---|---|---|
| `audit_logs`(M0) | 모든 쓰기 경로가 통과(원본 §14) | 환불/차감 로그 누락 → 출시 게이트 실패 |
| `staff`(M1) | `instructor_staff_id`·`seller_staff_id`·`assigned_staff_id`·`substitute_staff_id`의 공통 선행(canon §2.8) | 수업 배정·판매 직원·담당 배정 불가 → 운영 코어·정산 정체 |
| `passes` + `pass_transactions`(M1) | 예약·출석·소진기준 매출의 공통 의존 | 차감 불가 → 수강권/소진 손익 전부 정지 |
| `reservations` ↔ `pass_transactions`(M1) | `deduct_timing` 정책 분기점(canon §6.1) | 차감 시점 오류 → 잔여횟수·매출 동시 오염 |
| `revenue_records`(M2·M3) | 이중기준 손익의 단일 적재처(canon §4) | 비면 수익분석 전체가 빈 화면 |

### 2.3 병렬 가능(낭비 없는 동시 진행)

| 동시 진행 가능한 트랙 | 조건 |
|---|---|
| 강사·직원 마스터(`staff`) ∥ 회원(`members`) | 둘 다 M0(users/studios)만 의존. 단 `*_staff_id` FK 사용(class_sessions/purchases/members.assigned) 전까지 `staff` 완성 필요 |
| CRM(`leads`/`counseling_logs`) ∥ 수업(`class_*`) | 둘 다 M0(members/studios)·`staff`만 의존, 서로 무관 |
| 비용(`expense_*` 수동) ∥ 예약/출석 | 비용은 회원/예약과 독립(수동 입력) |
| 알림 템플릿(`notification_templates`) ∥ 무엇이든 | 발송 트리거만 후행 연결 |
| 프론트(모바일 웹 예약 UI) ∥ 백엔드 예약 API | API 계약([`12-api.md`](./12-api.md)) 확정 후 |

---

## 3. 마일스톤별 에픽 → 스토리 분해

> 표기: **에픽**(대문자 굵게) 하위에 스토리(`US-#`). 각 스토리는 사용자 가치 한 줄 + 의존 테이블/enum + **완료 판정(AC, Acceptance Criteria)**. 모든 스토리는 암묵적으로 **테넌시 격리 + RBAC + audit_logs(쓰기 시)** 를 만족해야 한다(M0에서 골격 완성).

### M0 — 기반 (스프린트 0)

**E0-1 테넌시 & 데이터 격리**
- `US-001` 모든 업무 테이블에 `tenant_id`/`studio_id` 공통 컬럼(canon §1.2) 적용. **AC**: ORM/쿼리 레이어가 `tenant_id` 필터 누락 시 쿼리를 거부(런타임 가드). 교차 테넌트 조회 0건.
- `US-002` `tenants`·`studios` CRUD(글로벌 테이블). **AC**: 1 테넌트에 N 스튜디오, `studios.timezone` 기본 `Asia/Seoul`.

**E0-2 인증 & RBAC**
- `US-003` `users` 로그인(이메일/전화). **AC**: 7역할(`saas_admin`/`owner`/`manager`/`info_staff`/`instructor`/`accountant`/`member`, canon §3.18) 발급·로그인.
- `US-004` `roles`·`permissions` 매핑 적용(canon §5 매트릭스). **AC**: 강사(`instructor`)는 통장 잔액·전체 매출 접근 **불가**(403). 회원(`member`)은 본인 데이터만. 상세는 [`13-rbac.md`](./13-rbac.md).

**E0-3 감사 로그**
- `US-005` `audit_logs` 자동 적재 미들웨어. **AC**: `action ∈ {create,update,delete,refund,pass_adjust,match,login,export}` 발생 시 `before_json`/`after_json`/`actor_user_id`/`actor_role` 기록. append-only(수정·삭제 불가). 원본 §14 "모든 수정/삭제/환불/수강권 차감 변경" 100% 포착.

### M1 — 운영 코어 (S1~S2)

**E1-0 강사·직원 마스터**
- `US-100` `staff` 등록·프로필 관리(`name`/`phone`/`role`/`employment_type`/`status`). **AC**: `role`(canon §3.18: owner/manager/info_staff/instructor/accountant), `employment_type`(fulltime/parttime/freelance), `status`(active/inactive). `user_id`→`users` 연결(로그인 계정 있는 직원). 04-feature-catalog F-13-01(강사 프로필) 충족.
- `US-100b` `staff.available_hours_json` 근무 가능 시간 등록. **AC**: 강사별 근무 가능 시간대 저장(수업 배정·대체 강사 후보 산정의 기준). 04-feature-catalog F-13-02(근무 가능 시간) 충족. *정산 방식(`settlement_method`)은 메타만 보유, 실제 정산 집계는 M5 `settlements`(US-502).*

> **임계 경로 주의**: `staff`는 `class_sessions.instructor_staff_id`(수업 배정)·`purchases.seller_staff_id`(판매 직원)·`members.assigned_staff_id`/`leads.assigned_staff_id`(담당 배정)·`class_sessions.substitute_staff_id`(대체 강사, US-104)의 **선행**이다. 따라서 E1-1(회원·CRM)·E1-2(수업)보다 먼저(또는 병렬 착수 시 FK 사용 전까지) 완성되어야 한다. M5의 정산·수익성 분해(US-502/US-505)는 이 마스터를 재사용할 뿐 신규 생성하지 않는다.

**E1-1 회원 & CRM**
- `US-101` `members` 등록·상태관리(`member_status` 8종, canon §3.1). **AC**: 신규문의→등록완료 전이 가능, 태그(canon §3.17) 부여, `assigned_staff_id`→`staff`(담당, E1-0 선행).
- `US-102` `leads`·`counseling_logs`·`marketing_sources` 상담 파이프라인. **AC**: `lead_status`(canon §3.2) 7단계, 전환 시 `member_id` 연결, `assigned_staff_id`→`staff`(담당, E1-0 선행).

**E1-2 수업 & 공간**
- `US-103` `rooms`·`class_templates`(RRULE)·`class_sessions` 생성. **AC**: 정규 반복→회차 자동 생성, `class_type`(personal/group/trial), `session_status`(canon §3.4), `instructor_staff_id`→`staff`(수업 배정, E1-0 선행).
- `US-104` 강사 대체 배정(`substitute_staff_id`)·자동 폐강 후보(`auto_close_min_count`). **AC**: 정책값 canon §6.1 적용.

**E1-3 수강권**
- `US-105` `products`(권종·총횟수·기간·가격)·`passes` 발급. **AC**: `pass_kind`(canon §3.7), `unit_price_amount = round(final_amount / total_count)`(canon §4.2) 발급 시 고정.
- `US-106` `pass_transactions` 증감 원장(append-only). **AC**: `pass_txn_reason`(canon §3.9) 6종, `balance_after` 정합, 음수 잔여 불가.

**E1-4 예약 · 출석 · 차감**
- `US-107` 모바일 웹 직접 예약 + 관리자 대리 예약(`reservations`). **AC**: `reservation_status`(canon §3.5), `daily_booking_limit`·`booking_close_minutes` 정책 검증. 예약 30초(원본 §18).
- `US-108` 대기/자동전환(`waitlists`). **AC**: `waitlist_auto_promote`·`waitlist_promote_ttl_minutes`(canon §6.1).
- `US-109` 출석/결석/노쇼(`attendance`) + 차감 트리거. **AC**: `attendance_status`(canon §3.6), `deduct_timing`(on_booking/on_attend) 정책에 따라 `deduct_booking` **또는** `deduct_attend` 둘 중 하나만 발생(canon §3.9 주). 노쇼 차감(`no_show_deduct`) 반영. 상세 [`14-booking-policy.md`](./14-booking-policy.md).

### M2 — 정산 코어 (S3)

**E2-1 구매 & 결제**
- `US-201` `purchases`(정가/할인/실판매가)·`payments`. **AC**: `payment_status`(canon §3.10 5종)·`payment_method`(canon §3.11), `receivable_amount = amount − paid_amount` 자동. 결제 3클릭(원본 §18).
- `US-202` 미수금 관리. **AC**: `payment_status ∈ {receivable, partial}` 합계 = 미수금(canon §4.4).

**E2-2 환불**
- `US-203` 부분/전액 환불(`refunds`) + 잔여횟수 회수. **AC**: `restored_count`만큼 `pass_transactions` 복구, `refund_penalty_rate`·`refund_unit_basis`(canon §6.3) 적용. 상세 [`16-payment-refund-policy.md`](./16-payment-refund-policy.md).

**E2-3 결제기준 매출 인식**
- `US-204` 결제 시 `revenue_records` 적재(`revenue_basis=payment`). **AC**: `amount = paid_amount`, `recognized_at = paid_at`. 환불 시 `source_type=refund`, `amount` 음수 1건(canon §4.1). 순매출 자동 차감.

### M3 — 수익분석 MVP (S4)

**E3-1 소진기준 매출 인식**
- `US-301` 차감 시 `revenue_records` 적재(`revenue_basis=consumption`). **AC**: `amount = unit_price_amount`, `class_type`·`instructor_staff_id` 채움, `pass_transaction_id` 연결(canon §4.2). 결제기준과 **중복 합산 금지**(기준별 합산만).

**E3-2 비용 입력 & CSV 업로드**
- `US-302` `expense_records` 수동 입력 + `expense_categories`(17종, canon §3.13). **AC**: `cost_type`(fixed/variable) 자동 기본값, 증빙 첨부.
- `US-303` 통장/카드 CSV 업로드(`bank_transactions`/`card_expenses`). **AC**: 업로드 후 미매칭 목록 노출.

**E3-3 수동 매칭**
- `US-304` 계좌이체 입금자명↔회원명 추천 매칭(금액/날짜/이름). **AC**: 관리자가 `match_target`(revenue/expense/transfer/etc, canon §3.19) 수동 분류, `transaction_reconciliation_logs`에 `manual_matched` 기록. 상세 [`17-reconciliation-policy.md`](./17-reconciliation-policy.md).
- `US-305` 카드매출 입금 **수동 등록**(`card_sales`, `reconciliation_stage` 단계 입력). **AC**: 미입금 카드매출 = `reconciliation_stage != deposited` 합계(canon §4.4).

**E3-4 대시보드 4영역**
- `US-306` 관리자 대시보드(①오늘운영 ②이번 달 매출 ③이번 달 비용 ④이번 달 수익). **AC**: 영업이익 = 순매출 − 총비용, 영업이익률 = 영업이익 ÷ 순매출(canon §4.4). 10초 파악(원본 §18). 상세 [`09-admin-dashboard.md`](./09-admin-dashboard.md).
- `US-307` 수익분석 대시보드 **이중기준 토글**(payment/consumption). **AC**: 토글 시 동일 기간 두 기준 손익 모두 표시. 상세 [`10-profit-dashboard.md`](./10-profit-dashboard.md).
- `US-308` `financial_reports` 월집계 스냅샷. **AC**: `report_type=monthly_pl`, `revenue_basis`별 저장.

### M4 — 자동화 (S5~S6)

**E4-1 거래 자동분류**
- `US-401` `transaction_matching_rules`(거래처명 규칙) 엔진. **AC**: `priority` 오름차순 1건 적용, 미매칭은 목록 노출, "한 번 수정한 분류는 다음 거래부터 자동 적용"(원본 §7·§18).
- `US-402` 반복 비용 자동 등록(`is_recurring`). **AC**: 임대료/관리비 등 고정비 자동 생성.

**E4-2 자동 매칭 & 카드 대조**
- `US-403` 입금 자동 매칭(`bank_transactions` ↔ `payments`). **AC**: `is_matched` 자동, `auto_matched` 로그.
- `US-404` 카드매출 3단계 자동 대조(`card_sales`: approved→captured→deposited). **AC**: `net_deposit_amount = amount − fee_amount`, 통장 입금 매칭(`bank_transaction_id`).

**E4-3 월말 예측**
- `US-405` 월말 예상 매출/영업이익/현금잔고. **AC**: 산식은 [`19-metrics.md`](./19-metrics.md) 소유, 결제기준·소진기준 각각 예측.

### M5 — 수익성 심화 (S7)

**E5-1 분해 수익성**
- `US-501` 강사별/수업유형별/유입경로별 수익성. **AC**: 소진기준 `revenue_records`의 `instructor_staff_id`·`class_type`·`marketing_source` 분해 = 합산 일치.
- `US-502` `settlements` 강사 정산(출석 기준 수업 수). **AC**: `total_amount = base + bonus − deduction`, `status`(draft/confirmed/paid).

**E5-2 회원 인사이트 & 자동화**
- `US-503` CAC/LTV/재등록률/체험 전환율 지표 화면. **AC**: [`19-metrics.md`](./19-metrics.md) 산식.
- `US-504` 재등록 자동화 + 알림톡(`notifications` 13종, canon §3.20). **AC**: `notification_type` 트리거, 채널 `kakao`.
- `US-505` 운동일지(`exercise_logs`)·강사 코멘트(`instructor_comments`). **AC**: 강사는 담당 회원만(RBAC).

### M6 — 금융연동 (S8~S9)

**E6-1 외부 연동**
- `US-601` `external_integrations`·`sync_logs`(오픈뱅킹/PG/카드조회/홈택스). **AC**: `status`(connected/error), 동기화 실패 복구.
- `US-602` 오픈뱅킹 `bank_accounts`/`bank_transactions` 라이브. **AC**: 잔액 스냅샷 동기화.
- `US-603` PG 온라인 결제(`payment_provider`/`external_payment_id`). **AC**: `payment_method=online`.
- `US-604` 세무 리포트 내보내기(`financial_reports`, `tax_export`). **AC**: 회계사 공유 파일.

### M7 — SaaS 상품화 (S10~S11)

**E7-1 멀티테넌트 SaaS**
- `US-701` 다지점 관리(테넌트 N 스튜디오). **AC**: 스튜디오 간 데이터 격리.
- `US-702` `subscription_plans`·`tenant_subscriptions` 과금. **AC**: `status`(trial/active/past_due/...), 사용량 기반 과금.
- `US-703` 외부 샵 온보딩 + SaaS 관리자 전체 대시보드. **AC**: `saas_admin` 글로벌 조회. 상세 [`20-saas-architecture.md`](./20-saas-architecture.md).

---

## 4. 출시 정의 (Definition of Done)

각 마일스톤은 아래 DoD를 **전부** 만족해야 다음으로 넘어간다. 미충족 항목이 1개라도 있으면 게이트 미통과(출시 보류).

### 4.1 공통 DoD(모든 마일스톤)
- [ ] 모든 신규 쓰기 경로가 `tenant_id`/`studio_id` 격리를 통과(교차 테넌트 0건).
- [ ] 모든 수정/삭제/환불/수강권 차감이 `audit_logs`에 기록(누락 0건, 원본 §14).
- [ ] RBAC 매트릭스(canon §5) 위반 시 403, 특히 강사의 통장 잔액·전체 매출 차단.
- [ ] 모든 금액 필드 정수(원), 음수 잔여횟수·음수 잔액 발생 0건.
- [ ] 신규 enum 사용값이 canon §3 집합 내에 100% 존재(임의 값 0건).
- [ ] [`22-qa-checklist.md`](./22-qa-checklist.md) 해당 마일스톤 항목 전수 통과.

### 4.2 MVP 출시 게이트 DoD (M0~M3 종료)
| 영역 | 완료 판정 |
|---|---|
| 예약 1주기 | 예약 → (정책별)차감 → 출석/노쇼 → 잔여횟수·`pass_transactions` 정합. 취소 시 `restore_*` 복구 정확. |
| 모바일 웹 예약 | 회원이 30초 내 예약 완료(원본 §18). |
| 결제·미수 | 결제완료/입금대기/일부입금/미수금/환불완료 전 상태 동작, `receivable_amount` 정확. |
| **이중기준 손익** | 동일 기간에 `revenue_basis=payment`·`consumption` 두 손익 **모두** 산출, 환불 음수 반영, 기준 간 중복 합산 없음. |
| 비용·매칭 | 17종 비용 수동입력 + CSV 업로드 + 수동 매칭(`match_target`) + 미매칭 목록. |
| 대시보드 | 4영역 + 이중기준 토글, 원장 10초 파악. |
| 권한/로그/테넌시 | 공통 DoD 전부. |

### 4.3 단계 게이트 DoD 요약
| 마일스톤 | 추가 DoD 핵심 |
|---|---|
| M4 | 자동분류 정확도 ≥ 90%(샘플 검수), 카드매출 3단계 자동 대조 잔차 0, 자동매칭 오매칭 사람 복구 가능. |
| M5 | 강사별 수익성 = 소진기준 분해 합과 원 단위 일치, 정산 `total_amount` 산식 일치, 알림톡 발송 성공률 ≥ 95%. |
| M6 | 동기화 실패 시 `sync_logs` 기록 + 재시도 멱등, PG 결제 ↔ `payments` 정합, 세무 내보내기 검증. |
| M7 | 테넌트 격리 침투테스트 통과(타 테넌트 접근 0건), 구독 과금 금액·주기 정확, 외부 샵 온보딩 자가 완료. |

---

## 5. 핵심 리스크 게이트

각 게이트는 **통과 못 하면 다음 마일스톤 진입 금지**. 리스크 상세·대응은 [`23-risks.md`](./23-risks.md) 소유, 여기서는 일정상 "막는 조건"만 정의한다.

| 게이트 | 위치(마일스톤 사이) | 막는 리스크 | 통과 기준(정량) | 미통과 시 |
|---|---|---|---|---|
| **G0 격리·감사 게이트** | M0 → M1 | 테넌트 누수, 금전 로그 누락 | 교차 테넌트 쿼리 0건, 금전성 변경 `audit_logs` 포착률 100% | M1 착수 금지(되돌리기 불가능한 데이터 오염 방지) |
| **G1 차감 정합 게이트** | M1 → M2 | 잔여횟수·`pass_transactions` 불일치, 이중 차감 | 예약/취소/노쇼 1만 케이스 시뮬레이션 잔차 0, 음수 잔여 0 | 결제·매출 착수 금지 |
| **G2 이중기준 손익 게이트** | M3 → MVP 출시 | 결제/소진 기준 중복 합산, 환불 미반영 | 같은 데이터로 두 기준 손익 산출 + 환불 음수 반영 + 합산 분리 검증 통과 | **MVP 출시 보류**(차별화 핵심이므로 절대 양보 불가) |
| **G3 자동화 신뢰 게이트** | M4 → M5 | 오분류·오매칭이 손익을 오염 | 자동분류 정확도 ≥ 90%, 자동매칭은 항상 사람 복구 가능(되돌리기 로그) | 수익성 심화 착수 금지 |
| **G4 금융정합 게이트** | M6 → M7 | 외부 데이터 중복/누락, PG 불일치 | 동기화 멱등성 검증, PG↔`payments` 잔차 0, 실패 복구 자동화 | SaaS 상품화 착수 금지 |
| **G5 테넌트 격리 게이트** | M7 → 외부 판매 | 외부 샵 데이터 교차 노출 | 침투테스트로 타 테넌트 0건 접근, RBAC 전 역할 회귀 통과 | 외부 온보딩 금지 |

> **게이트 운영 규칙**: 게이트는 "기능이 됐는가"가 아니라 **"돌이킬 수 없는 손상을 막았는가"** 를 본다. 특히 **G0(격리·감사)** 와 **G2(이중기준 손익)** 는 이 제품의 정체성(SaaS 안전성 + 수익분석 차별화)이라 우회·연기 불가다.

---

## 6. 스프린트 캘린더(상대 일정)

> 절대 날짜가 아닌 **상대 스프린트(2주 단위)** 로 표기. 실제 캘린더는 팀 가용성에 맞춰 매핑한다.

| 스프린트 | 마일스톤 | 주요 에픽 | 게이트 |
|---|---|---|---|
| S0 | M0 | E0-1~E0-3(테넌시·RBAC·감사) | → G0 |
| S1 | M1 | E1-0·E1-1·E1-2(강사·직원 마스터·회원/CRM·수업) | |
| S2 | M1 | E1-3·E1-4(수강권·예약/출석/차감) | → G1 |
| S3 | M2 | E2-1~E2-3(결제·환불·결제기준매출) | |
| S4 | M3 | E3-1~E3-4(소진기준·비용·매칭·대시보드) | → G2 → **MVP 출시** |
| S5 | M4 | E4-1·E4-2(자동분류·자동매칭/카드대조) | |
| S6 | M4 | E4-3(월말 예측) | |
| S7 | M5 | E5-1·E5-2(수익성·정산) | → G3 |
| S8 | M6 | E6-1(외부 연동·오픈뱅킹) | |
| S9 | M6 | E6-1(PG·세무 내보내기) | → G4 |
| S10 | M7 | E7-1(다지점·과금) | |
| S11 | M7 | E7-1(온보딩·SaaS 대시보드) | → G5 → **외부 판매** |

**우선순위 원칙(원본 §17·§18 기반)**:
1. 권한·감사·테넌시 먼저(G0). 절대 후행 금지.
2. 운영 코어(예약·수강권·차감)로 "샵이 돌아가게" 만든다.
3. 이중기준 손익은 MVP에서 완성한다(차별화 심장, G2).
4. 자동화·수익성 심화는 MVP 실데이터가 쌓인 뒤(2차).
5. 외부 금융연동·SaaS 상품화는 정합성·격리가 검증된 뒤(3차).

---

## 7. 의존성 위반 안티패턴(하지 말 것)

| 안티패턴 | 왜 금지 | 올바른 순서 |
|---|---|---|
| 기능부터 만들고 `audit_logs`·RBAC·`tenant_id` 사후 적용 | 금전 데이터·격리 구멍이 소급 불가(원본 §14·§15) | M0에서 골격 완성 후 모든 기능이 그 위에 올라감 |
| 소진기준 매출을 2차로 미룸 | 과거 차감 이력 소급 인식 → 정합성 폭발(canon §4.2) | M1 차감 로직과 함께 M3에서 완성 |
| 자동매칭을 먼저 만들고 수동 매칭 생략 | 자동화 규칙의 학습/검증 원천(수동 이력)이 없어짐(원본 §7) | MVP 수동 매칭 → 2차 자동화 |
| 외부 금융연동을 MVP에 끌어옴 | 외부 의존·실패 복구 부담이 MVP를 지연 | CSV/수동(MVP) → 오픈뱅킹/PG(3차) |
| 대시보드 집계를 `revenue_records` 없이 직접 결제/차감 테이블에서 계산 | 이중기준 합산 중복·기준 혼선(canon §4) | 모든 매출은 `revenue_records` 단일 적재처 경유 |

---

## 관련 문서

- [`00-canon.md`](./00-canon.md) — 단일 진실원천(스키마·enum·RBAC·회계모델·정책 기본값). 본 문서 모든 명칭의 정의 권한.
- [`05-scope-mvp.md`](./05-scope-mvp.md) — MVP 범위(본 로드맵 M0~M3의 기능 정의).
- [`06-scope-phases.md`](./06-scope-phases.md) — 2차/3차 확장 범위(M4~M7의 기능 정의·단계 전환 기준).
- [`04-feature-catalog.md`](./04-feature-catalog.md) — 전체 기능 목록(에픽↔기능 매핑).
- [`09-admin-dashboard.md`](./09-admin-dashboard.md) — 관리자 대시보드 4영역(M3 산출).
- [`10-profit-dashboard.md`](./10-profit-dashboard.md) — 수익분석 대시보드(이중기준 토글, G2).
- [`11-erd.md`](./11-erd.md) — ERD 초안(의존성 그래프의 테이블 상세).
- [`12-api.md`](./12-api.md) — API 명세(프론트/백 병렬 진행의 계약).
- [`13-rbac.md`](./13-rbac.md) — 권한 정책(M0 RBAC 상세, G0·G5).
- [`14-booking-policy.md`](./14-booking-policy.md) — 예약/취소/노쇼/차감 정책(M1·G1).
- [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) — 결제/환불 정책(M2).
- [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) — 거래 매칭 정책(M3 수동·M4 자동).
- [`19-metrics.md`](./19-metrics.md) — 수익분석 지표 정의(손익 산식·예측·CAC/LTV).
- [`20-saas-architecture.md`](./20-saas-architecture.md) — SaaS 확장 아키텍처(M7).
- [`22-qa-checklist.md`](./22-qa-checklist.md) — QA 체크리스트(각 마일스톤 DoD 검증).
- [`23-risks.md`](./23-risks.md) — 운영 리스크와 대응(리스크 게이트 상세).
