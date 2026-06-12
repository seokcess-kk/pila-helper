# 13-rbac.md — 권한 정책 (RBAC)

> **목적**: 7개 역할(`saas_admin`/`owner`/`manager`/`info_staff`/`instructor`/`accountant`/`member`)에 대해 리소스×액션(CRUD)·특수액션·데이터 가시성·필드수준 민감정보 분리·테넌트 격리·`audit_logs` 기록 대상을 **글자 단위로 실행 가능한 정책**으로 확정한다. 이 문서는 [`00-canon.md`](./00-canon.md) §3.18(역할)·§5(RBAC 스켈레톤)·§2(`roles`/`permissions`/`audit_logs`)를 **상세화**할 뿐 정의를 바꾸지 않는다.

근거: [`_source-requirements.md`](./_source-requirements.md) §14(권한 관리)·§15(SaaS)·§18(UX 원칙) / [`00-canon.md`](./00-canon.md) §3.18·§5·§2(38 `audit_logs`).

---

## 1. 권한 모델 개요 (RBAC + 격리 + 스코프)

본 솔루션의 권한은 **3개 축의 곱**으로 정의된다. `permissions` 테이블([`00-canon.md`](./00-canon.md) §2-5)의 `role_code` × `resource` × `action` × `scope` 구조가 그대로 구현 단위다. `resource` 의 허용값은 §1.3 표준 어휘(리소스군 코드 13종)로 단일 확정한다(테이블명 금지).

```
허용 여부 = 테넌트/스튜디오 격리(필수 통과)
            ∧  role_code 가 해당 (resource, action) 권한 보유
            ∧  요청 대상 레코드가 role 의 scope(all/assigned/own) 안에 있음
            ∧  (민감 필드 요청 시) 해당 role 이 그 필드 그룹 열람 권한 보유
```

- **축 1 — 격리(Isolation)**: 모든 비-`saas_admin` 역할은 자기 `tenant_id` + `studio_id` 범위 안에서만 동작한다(§6). 격리는 권한 검사보다 **먼저** 적용되는 하드 게이트다.
- **축 2 — 역할×리소스×액션(RBAC Matrix)**: §3 매트릭스. `action ∈ {create, read, update, delete, export}` + 특수액션(§4).
- **축 3 — 스코프(Scope)**: 같은 액션이라도 보이는 **행(row) 범위**가 다르다.

### 1.1 스코프 정의 ([`00-canon.md`](./00-canon.md) §5 준용)

| 스코프 | 코드 | 의미 | 판정 기준(쿼리 필터) |
|---|---|---|---|
| 전체 | `all` | 자기 스튜디오 전체 행 | `tenant_id = :t AND studio_id = :s` |
| 담당 | `assigned` | 본인이 담당/배정된 행만 | + `assigned_staff_id = :me` 또는 `instructor_staff_id = :me` 또는 `substitute_staff_id = :me` |
| 본인 | `own` | 로그인 사용자 본인의 행만 | + `member_id = :my_member_id` (또는 `staff_id = :my_staff_id`) |
| 글로벌 | `global` | 테넌트 초월(=`saas_admin` 전용) | 격리 게이트 면제, 단 SaaS 운영 리소스로 한정 |

> **액션 표기**: 본 문서 매트릭스에서 `C`=create, `R`=read, `U`=update, `D`=delete, `X`=export(내보내기), `–`=접근 불가. 셀 안 괄호는 스코프(`all`/`assigned`/`own`) 또는 한정조건이다. 특수액션은 §4에서 별도 표로 관리한다.

### 1.2 역할 요약 ([`00-canon.md`](./00-canon.md) §3.18, `role` enum 7종 글자 일치)

| 코드 | 라벨 | 한 줄 권한 성격 | 기본 스코프 |
|---|---|---|---|
| `saas_admin` | SaaS 최고관리자 | 플랫폼 운영(테넌트 초월, 업무데이터는 조회 위주) | `global` |
| `owner` | 샵 오너 | 자기 스튜디오 **모든 데이터** CRUD + 재무 | `all` |
| `manager` | 샵 관리자 | 회원/예약/결제 **입력** 운영 | `all`(재무는 요약·읽기) |
| `info_staff` | 인포 직원 | 프론트 운영(회원/예약/수강권/결제 입력) | `all`(재무·매출 차단) |
| `instructor` | 강사 | **담당 수업·담당 회원 메모만** | `assigned` |
| `accountant` | 회계 담당자 | **매출/비용/수익분석(재무만)** | `all`(개인정보·운영 제한) |
| `member` | 회원 | **본인 예약/수강권/출석만** | `own` |

### 1.3 `permissions.resource` 표준 어휘 사전 (단일 확정)

> [`00-canon.md`](./00-canon.md) §2-5 `permissions.resource` 는 **리소스군 코드(short-form)** 를 저장값으로 쓴다(canon 예시: `members`/`payments`/`revenue`). **테이블명(`revenue_records`/`expense_records`/`bank_accounts` …)을 `resource` 값으로 쓰지 않는다.** 아래가 `permissions.resource` 의 **허용값 전수(13종)** 이며, `permissions` 시드(§8.2)·`lookup_permission`(§6.2)·[`12-api.md`](./12-api.md) 의 resource 값은 모두 이 어휘로 통일한다. 각 리소스군은 §3.1 마스터 매트릭스의 군(A~O)과 1:1 대응하고, 아래 "포함 테이블" 컬럼의 모든 테이블 접근 권한을 한 행으로 표현한다.

| `resource` 코드 | §3.1 군 | 한글명 | 포함 테이블([`00-canon.md`](./00-canon.md) §2 테이블명) |
|---|---|---|---|
| `members` | A | 회원 | `members`, `marketing_sources` |
| `crm` | B | 상담CRM | `leads`, `counseling_logs` |
| `reservations` | C | 예약/출석 | `reservations`, `attendance`, `waitlists` |
| `classes` | D | 수업/공간 | `class_templates`, `class_sessions`, `rooms` |
| `passes` | E | 수강권/차감 | `products`, `passes`, `pass_transactions` |
| `payments` | F | 결제/환불 | `purchases`, `payments`, `refunds` |
| `revenue` | G | 매출/수익분석 | `revenue_records`, `financial_reports` |
| `expenses` | H | 비용/정산 | `expense_records`, `expense_categories`, `settlements` |
| `banking` | I | 통장/카드/매칭 | `bank_accounts`, `bank_transactions`, `card_sales`, `card_expenses`, `transaction_matching_rules`, `transaction_reconciliation_logs` |
| `instructor_notes` | J | 강사코멘트/운동일지 | `instructor_comments`, `exercise_logs` |
| `notifications` | K | 알림 | `notification_templates`, `notifications` |
| `settings` | L | 설정·사용자·조직 | `users`, `roles`, `permissions`, `studios`, `tenants`, `staff` |
| `subscriptions` | M | SaaS 과금 | `subscription_plans`, `tenant_subscriptions` |
| `audit` | N | 감사로그 | `audit_logs` |
| `integrations` | O | 외부연동 | `external_integrations`, `sync_logs` |

> **표준화 결정**: `permissions.resource` 는 위 **리소스군 코드**로 단일 확정한다(테이블명 금지). 더 세밀한 테이블·필드 단위 제어는 §3.2 테이블별 상세표·§5 필드 그룹·§4 특수액션이 `resource` 코드 위에 얹혀 처리하며, `permissions` 행의 `resource` 값 자체는 항상 위 13종 중 하나다. (군 수는 §3.1 표가 `I-2 통장잔액`을 `banking` 의 필드 분리로 함께 다루므로 리소스군 코드 기준 13종으로 집계.)

---

## 2. 핵심 가시성 원칙 (요구사항 §14·§18 직역)

원본 요구사항 §14·§18을 권한 규칙으로 못박는다. 아래 5개는 **위반 시 즉시 거부(deny)** 되는 하드 규칙이다.

| # | 원칙 | 적용 규칙 | 위반 예시(거부) |
|---|---|---|---|
| P1 | 오너=모든 데이터 | `owner` 는 자기 스튜디오 전 리소스 CRUD + 재무 전체 | — |
| P2 | 관리자=회원/예약/결제 입력 | `manager`/`info_staff` 는 운영 입력 가능, **재무 원장은 차단/요약만** | `info_staff` 가 비용 원장 조회 → 거부 |
| P3 | 강사=담당 수업·담당 회원 메모만 | `instructor` 는 `assigned` 스코프 + `instructor_comments`/`exercise_logs` 작성 | 강사가 다른 강사 담당 회원 조회 → 거부 |
| P4 | **강사는 전체 매출·통장 잔액 접근 불가** | `instructor` 의 매출은 `assigned` 본인 매출만, `bank_accounts.balance_amount`·통장/카드 **전면 차단** | 강사가 통장 잔액/총매출 조회 → 거부 |
| P5 | 회계 담당자=매출/비용/수익분석 | `accountant` 는 재무(매출·비용·정산·통장·카드·수익분석) CRUD, **회원 개인정보(연락처·생년월일·의료메모)·예약운영은 차단/마스킹** | `accountant` 가 회원 의료메모 조회 → 거부 |
| P6 | 회원=본인 예약/수강권/출석만 | `member` 는 `own` 스코프 외 전면 차단, 타 회원 노출 금지 | 회원이 타 회원 예약 조회 → 거부 |
| P7 | 개인/결제/수익 정보 권한별 분리 | 필드수준 민감정보 그룹(§5)으로 분리 적용 | — |
| P8 | **모든 수정/삭제/환불/수강권 차감 변경은 `audit_logs` 기록** | §7 기록 대상 전수 적재 | 기록 누락 → 정합성 결함(QA 차단) |

---

## 3. 권한 매트릭스 (역할 × 리소스 × 액션)

> [`00-canon.md`](./00-canon.md) §5 스켈레톤을 리소스 13개 군으로 **확장**한다. 각 셀은 액션(CRUDX) + 스코프. 셀 값이 비는 경우 `–`(불가). 모든 비-`saas_admin` 권한은 §6 격리 게이트를 통과한 뒤 평가된다.

### 3.1 마스터 매트릭스 (요약 — 13 리소스군)

| 리소스군 \ 역할 | saas_admin | owner | manager | info_staff | instructor | accountant | member |
|---|---|---|---|---|---|---|---|
| **A. 회원(members)** | R(global) | CRUD(all) | CRUD(all) | CRUD(all) | R(assigned) | R(all·마스킹) | RU(own) |
| **B. 상담CRM(leads/counseling_logs)** | R(global) | CRUD(all) | CRUD(all) | CRUD(all) | R(assigned) | – | – |
| **C. 예약/출석(reservations/attendance/waitlists)** | R(global) | CRUD(all) | CRUD(all) | CRUD(all) | RU(assigned) | – | CRU(own) |
| **D. 수업(class_templates/class_sessions/rooms)** | R(global) | CRUD(all) | CRUD(all) | CRU(all) | R(assigned)+U(자기수업 메모) | – | R(공개) |
| **E. 수강권/차감(products/passes/pass_transactions)** | R(global) | CRUD(all) | CRUD(all) | CR(all) | R(assigned) | R(all·금액만) | R(own) |
| **F. 결제/환불(purchases/payments/refunds)** | R(global) | CRUD(all) | CRU(all) | CR(all) | – | R(all) | R(own) |
| **G. 매출/수익분석(revenue_records/financial_reports)** | R(global) | RX(all) | R(요약only) | – | R(assigned 매출만) | RX(all) | – |
| **H. 비용/정산(expense_records/expense_categories/settlements)** | R(global) | CRUDX(all) | – | – | R(own 정산만) | CRUDX(all) | – |
| **I. 통장/카드/매칭(bank_*/card_*/matching_rules)** | R(global) | RU(all) | – | – | **불가** | CRUDX(all) | – |
| **I-2. 통장 잔액(bank_accounts.balance_amount)** | R(global) | R(all) | – | – | **불가** | R(all) | – |
| **J. 강사코멘트/운동일지(instructor_comments/exercise_logs)** | R(global) | CRUD(all) | R(all) | R(all) | CRUD(assigned) | – | R(own) |
| **K. 알림(notifications/notification_templates)** | R(global) | CRUD(all) | CRU(all) | CRU(all) | – | – | R(own) |
| **L. 설정·사용자·역할(users/roles/permissions/studios)** | CRUD(global) | CRUD(all) | R(all) | – | – | – | – |
| **M. SaaS 과금(subscription_plans/tenant_subscriptions)** | CRUD(global) | R(own) | – | – | – | – | – |
| **N. 감사로그(audit_logs)** | R(global) | R(all) | – | – | – | R(재무관련) | – |
| **O. 외부연동(external_integrations/sync_logs)** | CRUD(global) | RU(all) | – | – | – | RU(재무연동) | – |

> 표기: `CRUDX` 일부만 부여될 때 해당 글자만 기재. `(요약only)`=집계 요약값만(원장 행 차단). `(마스킹)`=민감 필드 마스킹 적용(§5). `(금액만)`=`unit_price_amount` 등 금액 필드만, 개인 연락처 차단.

### 3.2 리소스별 상세 — 테이블 단위 권한 (CANON §2 테이블명 글자 일치)

#### A. 회원 — `members`, `marketing_sources`

| 테이블 | saas_admin | owner | manager | info_staff | instructor | accountant | member | 비고 |
|---|---|---|---|---|---|---|---|---|
| `members` | R | CRUD | CRUD | CRUD | R(assigned) | R(마스킹) | RU(own) | `instructor` 는 `assigned_staff_id=본인` 회원만. `accountant` 는 `name` 외 연락처·`birth_date`·`medical_note` 마스킹(§5) |
| `marketing_sources` | R | CRUD | RU | R | – | R | – | 유입경로 코드. `accountant` 는 유입경로별 수익성 분석 위해 R |

#### B. 상담 CRM — `leads`, `counseling_logs`

| 테이블 | saas_admin | owner | manager | info_staff | instructor | accountant | member | 비고 |
|---|---|---|---|---|---|---|---|---|
| `leads` | R | CRUD | CRUD | CRUD | R(assigned) | – | – | `lead_status`(§3.2) 전이 권한 = C/U |
| `counseling_logs` | R | CRUD | CRUD | CRUD | R(assigned) | – | – | 상담 메모 민감 → 강사는 담당 리드만 R |

#### C. 예약·출석 — `reservations`, `attendance`, `waitlists`

| 테이블 | saas_admin | owner | manager | info_staff | instructor | accountant | member | 비고 |
|---|---|---|---|---|---|---|---|---|
| `reservations` | R | CRUD | CRUD | CRUD | RU(assigned) | – | CRU(own) | 회원 직접예약=`is_self_booked` 구분. 강사는 자기 수업 예약만 U(출석 처리) |
| `attendance` | R | CRUD | CRUD | CRUD | CU(assigned) | – | R(own) | **출석/노쇼 처리(§4 특수액션)는 강사·인포·관리자·오너** |
| `waitlists` | R | CRUD | CRUD | CRUD | R(assigned) | – | CRU(own) | 대기신청=회원 C(own), 자동전환은 시스템 |

#### D. 수업·공간 — `class_templates`, `class_sessions`, `rooms`

| 테이블 | saas_admin | owner | manager | info_staff | instructor | accountant | member | 비고 |
|---|---|---|---|---|---|---|---|---|
| `class_templates` | R | CRUD | CRUD | CRU | R | – | – | 정책 오버라이드 필드 변경=오너/관리자 |
| `class_sessions` | R | CRUD | CRUD | CRU | R(assigned)+U(메모) | – | R(`is_public`) | 회원은 공개 회차만 조회. 강사 대체배정(`substitute_staff_id`)=관리자 이상 |
| `rooms` | R | CRUD | CRUD | R | R | – | – | 공간/정원 설정 |

#### E. 수강권·차감 — `products`, `passes`, `pass_transactions`

| 테이블 | saas_admin | owner | manager | info_staff | instructor | accountant | member | 비고 |
|---|---|---|---|---|---|---|---|---|
| `products` | R | CRUD | CRU | R | R | R | R(공개) | 상품(권종/가격) 정의 |
| `passes` | R | CRUD | CRUD | CR | R(assigned) | R(금액) | R(own) | 발급=C. `accountant` 는 `unit_price_amount` 등 금액 R |
| `pass_transactions` | R | CRU* | CRU* | C* | R(assigned) | R | R(own) | **수동차감/복구(`manual_deduct`/`manual_restore`)는 §4 특수액션 + audit 필수**. append-only이므로 U는 정정용 역분개만 |

> `*` `pass_transactions` 는 불변(append-only) 원장이므로 **물리 수정·삭제 불가**. "수정"은 반대 부호 보정 레코드 추가로만 이루어지며 전 건 `audit_logs.action='pass_adjust'` 기록(§7.3).

#### F. 결제·환불 — `purchases`, `payments`, `refunds`

| 테이블 | saas_admin | owner | manager | info_staff | instructor | accountant | member | 비고 |
|---|---|---|---|---|---|---|---|---|
| `purchases` | R | CRUD | CRU | CR | – | R | R(own) | 구매 헤더 |
| `payments` | R | CRUD | CRU | CR | – | R | R(own) | 결제 입력=인포/관리자/오너. `payment_status`(§3.10) 전이 |
| `refunds` | R | CRU | CR | – | – | R | R(own) | **환불 실행(§4)은 오너/관리자만 + audit 필수(`action='refund'`)**. `info_staff` 환불 불가 |

#### G. 매출·수익분석 — `revenue_records`, `financial_reports`

| 테이블 | saas_admin | owner | manager | info_staff | instructor | accountant | member | 비고 |
|---|---|---|---|---|---|---|---|---|
| `revenue_records` | R | R | R(요약) | – | R(assigned) | R | – | **강사는 본인 담당 소진기준 매출만**(P4). `revenue_basis` 토글은 owner/accountant |
| `financial_reports` | R | RX | – | – | – | CRUDX | – | 월말 손익·세무 리포트 생성·내보내기=`accountant`/`owner` |

> `revenue_records` 는 시스템 적재 원장(§4 이중손익). **사람이 직접 C/U/D 불가**(결제·차감·환불 트리거로만 생성). 따라서 R/X(조회·내보내기)만 권한 부여.

#### H. 비용·정산 — `expense_records`, `expense_categories`, `settlements`

| 테이블 | saas_admin | owner | manager | info_staff | instructor | accountant | member | 비고 |
|---|---|---|---|---|---|---|---|---|
| `expense_records` | R | CRUDX | – | – | – | CRUDX | – | 비용 원장. 수동입력·CSV 분류=`accountant`/`owner` |
| `expense_categories` | R | CRUD | – | – | – | CRUD | – | 17종 + 커스텀(§3.13) |
| `settlements` | R | CRUD | – | – | R(own) | CRUD | – | 강사는 **본인 정산서만 R**(타 강사 정산 차단) |

#### I. 통장·카드·매칭 — `bank_accounts`, `bank_transactions`, `card_sales`, `card_expenses`, `transaction_matching_rules`, `transaction_reconciliation_logs`

| 테이블 | saas_admin | owner | manager | info_staff | instructor | accountant | member | 비고 |
|---|---|---|---|---|---|---|---|---|
| `bank_accounts` | R | R | – | – | **불가** | R | – | **잔액(`balance_amount`) 강사 전면 차단**(P4) |
| `bank_transactions` | R | RU | – | – | **불가** | CRUDX | – | CSV 업로드·매칭=`accountant` |
| `card_sales` | R | R | – | – | **불가** | CRUDX | – | 승인/매입/입금 3단계(§3.21) 추적 |
| `card_expenses` | R | R | – | – | **불가** | CRUDX | – | 카드 사용내역 분류 |
| `transaction_matching_rules` | R | RU | – | – | **불가** | CRUD | – | **규칙 변경(§4)은 audit 필수(`action='match'` 또는 `update`)** |
| `transaction_reconciliation_logs` | R | R | – | – | **불가** | R | – | 매칭 처리 이력(append-only) |

#### J. 강사코멘트·운동일지 — `instructor_comments`, `exercise_logs`

| 테이블 | saas_admin | owner | manager | info_staff | instructor | accountant | member | 비고 |
|---|---|---|---|---|---|---|---|---|
| `instructor_comments` | R | CRUD | R | R | CRUD(assigned) | – | R(own) | **강사는 담당 회원에 한해 작성/수정**(P3). 회원은 본인 코멘트 R |
| `exercise_logs` | R | CRUD | R | R | CRUD(assigned) | – | R(own) | 2차 기능. 강사 작성 → 회원 본인 열람 |

#### K. 알림 — `notification_templates`, `notifications`

| 테이블 | saas_admin | owner | manager | info_staff | instructor | accountant | member | 비고 |
|---|---|---|---|---|---|---|---|---|
| `notification_templates` | R | CRUD | RU | R | – | – | – | 13종 템플릿(§3.20) 편집=오너/관리자 |
| `notifications` | R | CRUD | CRU | CRU | – | – | R(own) | 수동발송=인포/관리자. 회원은 수신 이력 R |

#### L. 설정·사용자·조직 — `users`, `roles`, `permissions`, `studios`, `tenants`, `staff`

| 테이블 | saas_admin | owner | manager | info_staff | instructor | accountant | member | 비고 |
|---|---|---|---|---|---|---|---|---|
| `tenants` | CRUD | RU(own) | R | – | – | – | – | 테넌트 메타. 생성/정지=`saas_admin` |
| `studios` | CRUD | RU(own) | R | – | – | – | – | `policy_json`(§6) 편집=오너 |
| `users` | CRUD(global) | CRUD | R | – | – | – | RU(own 본인계정) | 직원 초대·역할부여=오너 |
| `staff` | R | CRUD | RU | R | RU(own 프로필) | R | – | 강사 본인 프로필 일부 U |
| `roles` | CRUD | R | – | – | – | – | – | 역할 코드(§3.18)는 SaaS 고정, 오너는 조회 |
| `permissions` | CRUD | RU | – | – | – | – | – | 역할-권한 매핑 조정=오너(스튜디오 범위) |

#### M. SaaS 과금 — `subscription_plans`, `tenant_subscriptions`

| 테이블 | saas_admin | owner | manager | info_staff | instructor | accountant | member | 비고 |
|---|---|---|---|---|---|---|---|---|
| `subscription_plans` | CRUD | R | – | – | – | – | – | 글로벌 요금제 정의=`saas_admin` |
| `tenant_subscriptions` | CRUD | R(own) | – | – | – | – | – | 오너는 본인 구독 현황 R |

#### N·O. 감사·외부연동 — `audit_logs`, `external_integrations`, `sync_logs`

| 테이블 | saas_admin | owner | manager | info_staff | instructor | accountant | member | 비고 |
|---|---|---|---|---|---|---|---|---|
| `audit_logs` | R | R | – | – | – | R(재무 entity만) | – | **append-only, 수정·삭제 불가**(§7.5). `accountant` 는 payments/refunds/expense/match 관련 감사만 |
| `external_integrations` | CRUD | RU | – | – | – | RU(재무연동) | – | 오픈뱅킹/PG/알림톡 연동 설정 |
| `sync_logs` | R | R | – | – | – | R | – | 동기화 실패 이력 |

---

## 4. 특수 액션 권한 (CRUD로 표현 불가한 금전·상태 변경)

CRUD 외에 **상태 전이·금전 변동을 일으키는 동작**은 별도 권한으로 관리한다. 아래 표의 ✅는 허용, ❌는 금지, `(scope)`는 스코프 한정. **★ 표시 액션은 전 건 `audit_logs` 필수(§7)**.

| 특수 액션 | 대상 테이블 | saas_admin | owner | manager | info_staff | instructor | accountant | member | audit |
|---|---|---|---|---|---|---|---|---|---|
| 회원 대리예약(`is_self_booked=false`) | `reservations` | ❌ | ✅ | ✅ | ✅ | ✅(assigned) | ❌ | ❌(본인 직접만) | — |
| 회원 직접예약(`is_self_booked=true`) | `reservations` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅(own) | — |
| 예약 취소 | `reservations` | ❌ | ✅ | ✅ | ✅ | ✅(assigned) | ❌ | ✅(own·정책 내) | ★(차감 동반 시) |
| 출석/지각/결석 처리 | `attendance` | ❌ | ✅ | ✅ | ✅ | ✅(assigned) | ❌ | ❌ | ★ |
| **노쇼 처리(`no_show`)** | `attendance` | ❌ | ✅ | ✅ | ✅ | ✅(assigned) | ❌ | ❌ | ★ |
| **수강권 수동차감(`manual_deduct`)** | `pass_transactions` | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ★ |
| **수강권 수동복구(`manual_restore`)** | `pass_transactions` | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ★ |
| 수강권 정지/연장(홀딩) | `passes` | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ★ |
| 결제 입력 | `payments` | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ★(update 시) |
| **환불 실행(refund)** | `refunds` | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ★ |
| 비용 수동입력/CSV 업로드 | `expense_records` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ★(update/delete 시) |
| **거래 매칭/재분류** | `bank_transactions`/`card_*` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ★ |
| **분류규칙 생성/수정** | `transaction_matching_rules` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ★ |
| 정산서 확정/지급 처리 | `settlements` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ★ |
| 재무/세무 리포트 내보내기(export) | `financial_reports` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ★(export) |
| 매출 데이터 내보내기(export) | `revenue_records` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ★(export) |
| 직원 초대·역할 부여 | `users` | ✅(global) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ★ |
| 스튜디오 정책(`policy_json`) 변경 | `studios` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ★ |
| 외부연동 연결/해제 | `external_integrations` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅(재무) | ❌ | ★ |
| 로그인 | `users`(세션) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ★(`action='login'`) |

> **차감 시점과 권한의 관계**: [`00-canon.md`](./00-canon.md) §6.1 `deduct_timing` 이 `on_booking` 이면 예약 생성 주체(대리=직원, 직접=회원)가 차감을 유발하고, `on_attend` 이면 출석 처리 주체(강사/인포/관리자/오너)가 유발한다. 어느 경우든 자동 생성되는 `pass_transactions`(`deduct_booking`/`deduct_attend`)는 시스템 트리거이며 `audit_logs.action='pass_adjust'` 가 함께 적재된다. **사람의 수동 개입(`manual_*`)만 위 표의 별도 권한이 필요**하다.

---

## 5. 필드수준 민감정보 분리 (개인 · 결제 · 수익)

원본 §14·§18 "개인/결제/수익 정보 권한별 분리"·"개인/금융/결제/매출/비용 정보는 보안·권한 분리 최우선"을 **필드 그룹 단위**로 구현한다. 동일 레코드를 조회해도 역할에 따라 일부 필드는 마스킹/차단된다.

### 5.1 민감 필드 그룹 정의

| 그룹 | 코드 | 포함 필드(테이블.컬럼) | 보호 사유 |
|---|---|---|---|
| 개인식별 | `pii` | `members.phone`, `members.birth_date`, `members.gender`, `leads.phone`, `counseling_logs.content`, `users.email`, `users.phone` | 개인정보(연락처/생년월일) |
| 의료민감 | `pii_medical` | `members.medical_note`, `members.goal` | 통증·주의사항(건강 민감정보) |
| 결제정보 | `payment` | `payments.card_approval_no`, `payments.depositor_name`, `payments.external_payment_id`, `bank_accounts.account_no_masked`, `card_*.approval_no`, `card_*.card_no_masked` | 카드 승인번호·계좌·입금자명 |
| 수익정보 | `revenue` | `revenue_records.amount`, `financial_reports.data_json`, `bank_accounts.balance_amount`, `passes.unit_price_amount`(소진단가), `settlements.*_amount`(타인 정산) | 매출·잔액·수익성 |
| 비용정보 | `expense` | `expense_records.amount`, `card_expenses.amount`, `bank_transactions.amount`(출금) | 지출·거래처 금액 |

### 5.2 역할 × 필드 그룹 가시성 매트릭스

| 필드 그룹 | saas_admin | owner | manager | info_staff | instructor | accountant | member |
|---|---|---|---|---|---|---|---|
| `pii`(연락처·생년월일) | 🔒마스킹 | ✅ | ✅ | ✅ | 🔒담당만 | 🔒마스킹 | ✅(own) |
| `pii_medical`(의료·목적) | ❌ | ✅ | ✅ | ✅ | 🔒담당만 | ❌ | ✅(own) |
| `payment`(승인번호·계좌) | 🔒마스킹 | ✅ | ✅ | ✅ | ❌ | ✅ | 🔒부분(own) |
| `revenue`(매출·잔액·단가) | ✅(집계) | ✅ | 🔒요약only | ❌ | 🔒본인담당 매출만 | ✅ | ❌ |
| `expense`(지출·거래처) | ✅(집계) | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |

> 범례: `✅`=원본 노출, `🔒`=조건부(마스킹/요약/담당한정), `❌`=필드 자체 미반환(API 응답에서 키 제거).

### 5.3 마스킹·요약 규칙 (구현 예시)

```
# pii 마스킹(saas_admin, accountant)
phone        010-1234-5678  →  010-****-5678
birth_date   1990-03-15     →  1990(연도만) 또는 null
name         김민지          →  김*지

# payment 마스킹(saas_admin)
card_approval_no  30214455  →  ****4455
account_no_masked 110-***   →  그대로(이미 마스킹)

# revenue 요약only(manager)
revenue_records 원장 행 조회  →  ❌ (거부)
이번 달 순매출 집계값         →  ✅ (대시보드 요약 카드만)

# revenue 담당한정(instructor)
WHERE revenue_basis='consumption'
  AND instructor_staff_id = :my_staff_id   # 본인 담당 소진매출만
# 통장 잔액/총매출 집계는 전면 차단(P4)
```

### 5.4 강사(`instructor`) 가시성 — P3·P4 정밀 규정

강사 권한은 오해 소지가 커 별도로 못박는다.

| 강사가 볼 수 있는 것 | 강사가 볼 수 **없는** 것 |
|---|---|
| 본인 `assigned`/`instructor_staff_id`/`substitute_staff_id` 수업과 예약자 명단 | 다른 강사 담당 수업·회원 |
| 담당 회원의 이름·예약·출석·`instructor_comments`/`exercise_logs` | 회원 전체 결제 내역·환불(`payment` 그룹) |
| 본인 담당 **소진기준 매출**(`revenue_basis='consumption'` AND 본인) | **전체 매출·통장 잔액·미수금 집계(P4 — 전면 차단)** |
| 본인 정산서(`settlements` where `staff_id=본인`) | 다른 강사 정산서·전체 비용 원장 |
| 담당 회원 `pii`/`pii_medical`(레슨 안전 목적) | 비담당 회원의 어떤 개인정보도 |

---

## 6. 테넌트·스튜디오 격리 원칙

[`00-canon.md`](./00-canon.md) §1.2 공통컬럼(`tenant_id`/`studio_id`)·§5 격리 원칙을 권한 게이트로 구현한다. **격리는 RBAC 평가보다 먼저 적용되는 절대 게이트**다.

### 6.1 격리 규칙

| 규칙 | 내용 |
|---|---|
| G1. 필수 필터 | 모든 업무 쿼리는 `WHERE tenant_id = :session.tenant_id AND studio_id = :session.studio_id` 를 **강제 주입**한다(애플리케이션 레이어 + DB Row-Level Security 권장). |
| G2. saas_admin 예외 | `saas_admin` 만 `tenant_id` 게이트 면제(`global`). 단 업무 원장(payments/members 등)은 **조회(R) 위주**이며, 직접 금전 수정은 금지(§3 표의 `–`/`R`). |
| G3. 교차 테넌트 차단 | 세션의 `tenant_id` 와 다른 레코드는 **존재하지 않는 것으로 응답(404)**, 권한오류(403) 대신 404로 존재 자체를 숨긴다. |
| G4. 다지점 오너 | 한 오너가 복수 `studio_id` 보유 시, 세션의 활성 `studio_id` 로 스코프 제한. 지점 전환은 명시적 컨텍스트 스위치(감사 기록). |
| G5. 글로벌 코드 테이블 | `roles`(§2-4)·`subscription_plans`(§2-41)는 `studio_id` 미보유 글로벌. 일반 역할은 R만. |
| G6. 회원 계정 매핑 | `member` 역할은 `users.member_id` → `members.id` 로만 `own` 판정. 다른 스튜디오 같은 사람도 별 레코드(교차 차단). |

### 6.2 격리 + 스코프 평가 순서 (의사코드)

```
function authorize(session, resource, action, target_row, fields):
    # 0) 격리 게이트(최우선)
    if session.role != 'saas_admin':
        if target_row.tenant_id != session.tenant_id: return DENY_404
        if target_row.studio_id != session.studio_id: return DENY_404

    # 1) RBAC 매트릭스(§3)
    resource = to_resource_group(resource)   # 테이블명 입력 시 §1.3 리소스군 코드로 정규화(예: revenue_records→revenue)
    perm = lookup_permission(session.role, resource, action)   # roles×permissions, resource ∈ §1.3 어휘 13종
    if perm is None: return DENY_403

    # 2) 스코프(§1.1)
    if perm.scope == 'assigned' and not is_assigned(session, target_row): return DENY_403
    if perm.scope == 'own'      and not is_owner(session, target_row):    return DENY_403

    # 3) 필드수준 민감정보(§5)
    visible = apply_field_masking(session.role, resource, fields)   # pii/payment/revenue ...

    # 4) 특수액션 추가검사(§4) + audit 기록(§7)
    if action in SPECIAL_ACTIONS and not allowed_special(session.role, action): return DENY_403
    if is_auditable(resource, action): enqueue_audit_log(session, resource, action, before, after)

    return ALLOW(visible)
```

---

## 7. 감사 로그(`audit_logs`) — 기록 대상·항목

> 원본 §14·§18: **"모든 수정/삭제/환불/수강권 차감 변경은 `audit_logs` 기록"**, "모든 금전 관련 수정은 로그". 이 절은 [`00-canon.md`](./00-canon.md) §2-38 `audit_logs` 스키마를 **누가/언제/무엇을/before→after** 관점으로 운영 규칙화한다.

### 7.1 `audit_logs` 기록 항목 (CANON §2-38 컬럼 글자 일치)

| 항목 | 컬럼 | 채움 규칙 | 예시 |
|---|---|---|---|
| 누가(주체) | `actor_user_id`→`users` | 로그인 사용자 id. 시스템 트리거는 시스템 유저 id | `u_8f3a…` |
| 누구 역할 | `actor_role`◆(§3.18) | 액션 당시 역할 스냅샷 | `manager` |
| 무엇을(대상) | `entity_type`(테이블명) + `entity_id` | 변경 레코드의 테이블·PK | `payments` / `pay_220…` |
| 어떤 동작 | `action` | create/update/delete/refund/pass_adjust/match/login/export | `refund` |
| 변경 전 | `before_json` | 변경 전 스냅샷(민감필드는 §7.6 마스킹) | `{"refund_amount":0}` |
| 변경 후 | `after_json` | 변경 후 스냅샷 | `{"refund_amount":120000,"status":"completed"}` |
| 출처 | `ip_address` | 요청 IP | `203.0.113.7` |
| 언제 | `occurred_at` | 발생 시각(UTC, §1.4) | `2026-06-12T04:11:02Z` |

> `audit_logs` 는 **append-only**([`00-canon.md`](./00-canon.md) §2-38: *deleted_at 미사용*). 수정·삭제 불가. 보관 무기한(금전·감사 데이터, 물리 삭제 금지).

### 7.2 기록 **필수** 대상 (★ = 원본 §14 명시 4종 포함)

| 분류 | 트리거 | `entity_type` | `action` | 사유 |
|---|---|---|---|---|
| ★수정 | 모든 업무 레코드 UPDATE | 해당 테이블 | `update` | 원본 §14 "모든 수정" |
| ★삭제 | 소프트 삭제(`deleted_at` 설정) | 해당 테이블 | `delete` | 원본 §14 "모든 삭제" |
| ★환불 | `refunds` 실행 | `refunds` | `refund` | 원본 §14 "모든 환불" |
| ★수강권 차감 | `pass_transactions` 차감/복구(수동·노쇼 포함) | `pass_transactions` | `pass_adjust` | 원본 §14 "수강권 차감 변경" |
| 결제 변경 | `payments` 상태/금액 변경 | `payments` | `update` | 금전(§18 "모든 금전 수정") |
| 비용 변경 | `expense_records` 수정/삭제 | `expense_records` | `update`/`delete` | 금전 |
| 거래 매칭/재분류 | `bank_transactions`/`card_*` 매칭·재분류 | 해당 테이블 | `match` | 분류규칙 변경 추적 |
| 분류규칙 변경 | `transaction_matching_rules` C/U | `transaction_matching_rules` | `update` | "다음 거래부터 자동 적용" 영향 |
| 정산 확정/지급 | `settlements` 상태 전이 | `settlements` | `update` | 금전 |
| 역할/권한 변경 | `users`/`permissions` 변경 | 해당 테이블 | `update` | 보안 |
| 정책 변경 | `studios.policy_json` 변경 | `studios` | `update` | 정책 영향 |
| 데이터 내보내기 | 매출/재무/세무 export | `revenue_records`/`financial_reports` | `export` | 민감정보 반출 추적 |
| 로그인 | 인증 성공/실패 | `users` | `login` | 접근 추적 |

> **이중 기록 주의**: 환불 1건은 `refunds`(action=`refund`) + 연동된 `payments`(action=`update`) + 복구된 `pass_transactions`(action=`pass_adjust`) + `revenue_records` 음수 적재(트리거)로 **여러 audit 행**이 생긴다. 정상이며, `entity_id` 와 `occurred_at` 으로 한 트랜잭션 묶음을 추적한다(상관관계 키 권장: `trace_id` 를 `before_json`/`after_json` 메타로 포함).

### 7.3 기록 예시 — 수강권 수동차감 (`pass_adjust`)

```json
{
  "actor_user_id": "u_manager_07",
  "actor_role": "manager",
  "entity_type": "pass_transactions",
  "entity_id": "ptx_9a21",
  "action": "pass_adjust",
  "before_json": { "remaining_count_before": 8 },
  "after_json": {
    "reason": "manual_deduct",
    "delta": -1,
    "balance_after": 7,
    "memo": "현장 수기예약 누락분 보정",
    "pass_id": "pass_3311"
  },
  "ip_address": "203.0.113.7",
  "occurred_at": "2026-06-12T05:02:44Z"
}
```

### 7.4 기록 예시 — 환불 실행 (`refund`)

```json
{
  "actor_user_id": "u_owner_01",
  "actor_role": "owner",
  "entity_type": "refunds",
  "entity_id": "rf_5512",
  "action": "refund",
  "before_json": { "payment_status": "paid", "remaining_count": 6 },
  "after_json": {
    "refund_amount": 120000,
    "refund_reason": "회원 개인사정",
    "restored_count": 6,
    "status": "completed",
    "payment_status_after": "refunded",
    "pass_status_after": "refunded"
  },
  "ip_address": "192.0.2.44",
  "occurred_at": "2026-06-12T06:30:10Z"
}
```

### 7.5 기록 예시 — 분류규칙 수정 (`update`, "다음 거래부터 자동 적용" 추적)

```json
{
  "actor_user_id": "u_accountant_02",
  "actor_role": "accountant",
  "entity_type": "transaction_matching_rules",
  "entity_id": "rule_88",
  "action": "update",
  "before_json": { "pattern": "스타벅스", "expense_category": "meal", "cost_type": "variable" },
  "after_json":  { "pattern": "스타벅스", "expense_category": "education", "cost_type": "variable" },
  "ip_address": "198.51.100.9",
  "occurred_at": "2026-06-12T07:15:00Z"
}
```
> 규칙 변경은 [`17-reconciliation-policy.md`](./17-reconciliation-policy.md)·[`18-expense-category-policy.md`](./18-expense-category-policy.md)의 "다음 거래부터 자동 적용" 동작에 직접 영향하므로 before→after 보존이 필수다(소급 재분류 여부는 분류 정책 문서가 소유).

### 7.6 감사로그 자체의 민감정보 처리

- `before_json`/`after_json` 에 들어가는 `pii`/`payment` 필드는 **저장 시 마스킹**한다(예: `card_approval_no` → `****4455`, `phone` → `010-****-5678`).
- 단, 금액(`refund_amount`/`delta`/`*_amount`)은 감사 목적상 **원값 보존**한다(금전 추적 필수).
- `audit_logs` 열람 권한은 `owner`(전체)·`accountant`(재무 entity 한정)·`saas_admin`(global)으로 제한하며, **그 외 역할은 차단**(§3 N행).

### 7.7 감사로그 무결성 보증 규칙

| 규칙 | 내용 |
|---|---|
| AU1 | `audit_logs` 는 INSERT만 허용. UPDATE/DELETE를 DB 권한·트리거로 봉쇄(append-only). |
| AU2 | 감사 기록 실패 시 원 트랜잭션도 롤백(감사 누락 방지) — "기록 못 하면 변경도 무효". |
| AU3 | 시스템 자동 변경(차감·매출 적재)도 `actor_user_id`=시스템유저, `actor_role` 추적값으로 기록. |
| AU4 | 동일 트랜잭션의 연쇄 변경(§7.2 이중기록)은 공통 `trace_id` 메타로 묶어 재구성 가능하게 한다. |

---

## 8. 권한 시드 데이터 (`roles` / `permissions` 초기값)

> [`00-canon.md`](./00-canon.md) §2-4·§2-5 구조에 맞춘 초기 시드. `permissions` 는 `role_code × resource × action × scope` 행으로 전개된다. 아래는 발췌 예시(전수는 §3 매트릭스를 행 단위로 기계 전개).

### 8.1 `roles` 시드 (§3.18 글자 일치)

| code | name_ko | description |
|---|---|---|
| `saas_admin` | SaaS 최고관리자 | 플랫폼 전체 운영, 테넌트 초월 |
| `owner` | 샵 오너 | 자기 스튜디오 모든 데이터 + 재무 |
| `manager` | 샵 관리자 | 회원/예약/결제 입력 운영 |
| `info_staff` | 인포 직원 | 프론트 운영(재무 제외) |
| `instructor` | 강사 | 담당 수업·담당 회원 메모 |
| `accountant` | 회계 담당자 | 매출/비용/수익분석(재무) |
| `member` | 회원 | 본인 데이터 |

### 8.2 `permissions` 시드 (발췌 — resource/action/scope)

> `resource` 값은 §1.3 표준 어휘(리소스군 코드 13종) 단일 확정값을 사용한다.

| role_code | resource | action | scope |
|---|---|---|---|
| `owner` | `members` | `create` | `all` |
| `owner` | `payments` | `update` | `all` |
| `manager` | `reservations` | `create` | `all` |
| `info_staff` | `payments` | `create` | `all` |
| `info_staff` | `expenses` | `read` | `–`(없음=미생성) |
| `instructor` | `reservations` | `update` | `assigned` |
| `instructor` | `revenue` | `read` | `assigned` |
| `instructor` | `banking` | `read` | `–`(미생성=차단) |
| `accountant` | `expenses` | `create` | `all` |
| `accountant` | `banking` | `update` | `all` |
| `accountant` | `members` | `read` | `all`(+`pii` 마스킹) |
| `member` | `reservations` | `create` | `own` |
| `member` | `passes` | `read` | `own` |
| `saas_admin` | `subscriptions` | `update` | `global` |

> **`resource` 값 규칙**: 위 `resource` 컬럼은 §1.3 표준 어휘(13종 리소스군 코드)만 사용한다 — 테이블명(`revenue_records`/`expense_records`/`bank_accounts`/`transaction_matching_rules`/`tenant_subscriptions` 등)을 직접 쓰지 않는다. 예: `revenue_records`→`revenue`, `expense_records`→`expenses`, `bank_accounts`/`transaction_matching_rules`→`banking`, `tenant_subscriptions`→`subscriptions`. 이로써 `lookup_permission`(§6.2) 매칭이 [`12-api.md`](./12-api.md)·canon §2-5 와 글자 단위로 일치한다.
>
> **구현 규칙**: 권한이 **없는** 조합은 `permissions` 에 행을 만들지 않는다(화이트리스트 방식 — 행이 없으면 deny). 필드 마스킹은 별도 `field_policy`(또는 `permissions.scope` 메타)로 적용(§5).

---

## 9. 거부(Deny) 케이스 모음 — 회귀 테스트용

[`22-qa-checklist.md`](./22-qa-checklist.md) 가 검증을 소유하나, 권한 회귀의 핵심 케이스를 여기 명시한다.

| # | 시나리오 | 기대 결과 |
|---|---|---|
| D1 | `instructor` 가 통장 잔액(`bank_accounts.balance_amount`) 조회 | **403 거부**(P4) |
| D2 | `instructor` 가 전체 매출 집계 조회 | **403 거부**(본인 담당 소진매출만 허용) |
| D3 | `info_staff` 가 환불 실행 | **403 거부**(환불=오너/관리자만, §4) |
| D4 | `info_staff` 가 `expense_records` 원장 조회 | **403 거부**(P2) |
| D5 | `accountant` 가 회원 `medical_note` 조회 | **필드 미반환**(P5/§5.2) |
| D6 | `accountant` 가 회원 `phone` 조회 | **마스킹 반환**(010-****-5678) |
| D7 | `member` 가 타 회원 예약 조회 | **404**(존재 은닉, G3) |
| D8 | `manager` 가 `revenue_records` 원장 행 조회 | **403**(요약only 허용, G/§3.1) |
| D9 | A스튜디오 `owner` 가 B스튜디오 회원 조회 | **404**(교차 테넌트 차단, G3) |
| D10 | `manager` 가 수강권 `manual_deduct` 없이 임의 `pass_transactions` 물리 수정 | **거부**(append-only, §3.2-E) |
| D11 | 환불 실행 후 `audit_logs` 미적재 | **트랜잭션 롤백**(AU2) — 환불 자체 무효 |
| D12 | `instructor` 가 비담당 회원 `instructor_comments` 작성 | **403**(P3, assigned 한정) |
| D13 | `saas_admin` 이 특정 테넌트 `payments` 금액 직접 수정 | **거부**(G2, 조회 위주) |
| D14 | `member` 가 본인 `members.medical_note` 조회 | **허용**(own, §5.2) |

---

## 10. 관련 문서

- [`00-canon.md`](./00-canon.md) — 단일 진실원천(역할 §3.18 · RBAC 스켈레톤 §5 · `roles`/`permissions`/`audit_logs` §2)
- [`_source-requirements.md`](./_source-requirements.md) — 정본 소스(§14 권한 관리 · §15 SaaS · §18 UX 원칙)
- [`02-personas.md`](./02-personas.md) — 역할별 페르소나
- [`12-api.md`](./12-api.md) — API 엔드포인트(리소스 enum·스코프 준수, 본 매트릭스 강제)
- [`14-booking-policy.md`](./14-booking-policy.md) — 예약/취소/노쇼/차감(특수액션 §4 연계)
- [`15-pass-policy.md`](./15-pass-policy.md) — 수강권 수동차감/복구 권한 연계
- [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) — 환불 실행 권한·audit 연계
- [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) — 거래 매칭·분류규칙 변경 권한
- [`18-expense-category-policy.md`](./18-expense-category-policy.md) — 비용 분류규칙 audit
- [`20-saas-architecture.md`](./20-saas-architecture.md) — 테넌트/스튜디오 격리 아키텍처(§6 연계)
- [`22-qa-checklist.md`](./22-qa-checklist.md) — 권한 거부 케이스(§9) 검증
- [`23-risks.md`](./23-risks.md) — 권한·민감정보 리스크와 대응
