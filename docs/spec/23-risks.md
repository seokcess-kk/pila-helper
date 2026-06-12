# 23-risks.md — 운영 리스크와 대응 방안

> **목적**: 본 솔루션 운영 시 발생할 수 있는 리스크를 **10개 카테고리**로 분류하고, 각 리스크별로 영향도·발생가능성·예방(Prevent)·탐지(Detect)·완화(Mitigate)·복구(Recover)를 **실행 가능한 수준**으로 정의한다. 모든 대응은 [`00-canon.md`](./00-canon.md)의 `audit_logs`·RBAC·검증 불변식·백업 정책과 연결되며, 각 리스크에 **담당 역할**과 **우선순위(P0~P3)**를 부여한다.

근거: [`_source-requirements.md`](./_source-requirements.md) §5(결제)·§7(비용)·§9(통장/카드 연동)·§14(권한)·§15(SaaS)·§18(UX 원칙: 보안·권한 분리·금전 로그) / [`00-canon.md`](./00-canon.md) §1.2(공통 컬럼·소프트삭제·감사로그)·§2(38 `audit_logs`)·§4(이중 손익)·§5(RBAC)·§6(정책 파라미터).

---

## 1. 리스크 관리 프레임워크

### 1.1 평가 척도

리스크는 **영향도(Impact)** × **발생가능성(Likelihood)**으로 등급화하고, 둘의 곱으로 **리스크 점수(Risk Score)**와 **우선순위(Priority)**를 산정한다.

| 척도 | 5 (Critical) | 4 (High) | 3 (Medium) | 2 (Low) | 1 (Minimal) |
|---|---|---|---|---|---|
| **영향도** | 금전 손실/법규 위반/데이터 누수로 사업 존속 위협 | 다수 회원·테넌트 영향, 환불·신뢰 손상 | 단일 테넌트 운영 차질, 수동 복구 가능 | 일부 화면 오류, 우회 가능 | 사소한 불편 |
| **발생가능성** | 상시 발생 | 주 단위 발생 | 월 단위 발생 | 분기 단위 | 연 단위 미만 |

```
리스크 점수 = 영향도 × 발생가능성   (1 ~ 25)

우선순위 매핑:
  P0 (즉시/필수)   : 점수 ≥ 16  또는  영향도 = 5(금전·법규·누수)
  P1 (높음)        : 12 ≤ 점수 ≤ 15
  P2 (중간)        : 6  ≤ 점수 ≤ 11
  P3 (낮음/모니터) : 점수 ≤ 5
```

> 영향도 5(금전 손실·법규 위반·데이터 누수)는 발생가능성이 낮아도 **무조건 P0**로 승격한다. 회계/결제/개인정보 SaaS의 특성상 "드물지만 치명적"인 리스크가 핵심이기 때문이다.

### 1.2 4단계 대응(PDMR) 정의

각 리스크는 아래 4단계로 대응을 설계한다. 사후 복구만이 아니라 **사전 예방 + 실시간 탐지**를 우선한다.

| 단계 | 약어 | 정의 | 본 솔루션의 주요 수단 |
|---|---|---|---|
| **예방** | Prevent | 리스크 발생 자체를 막는 설계·통제 | RBAC 격리, DB 제약(CHECK/UNIQUE/FK), append-only 원장, 입력검증 |
| **탐지** | Detect | 발생 시 빠르게 인지 | `audit_logs`, 정합성 배치, 알림, `sync_logs`, 대시보드 이상치 |
| **완화** | Mitigate | 영향 범위·피해 축소 | 미매칭 큐 격리, 소프트삭제, 멱등 처리, 회로차단(circuit breaker) |
| **복구** | Recover | 정상 상태로 되돌림 | PITR 백업 복원, 원장 역분개(reverse), 재동기화, 수동 정정 + 감사 |

### 1.3 담당 역할 표기

담당은 [`00-canon.md`](./00-canon.md) §3.18 `role`을 기준으로 한다. SaaS 플랫폼 운영 책임은 `saas_admin`, 단일 테넌트 운영 책임은 `owner`/`accountant`/`manager`로 표기한다. (개발/인프라 담당은 SaaS 운영 조직 = `saas_admin` 책임 범위로 묶는다.)

### 1.4 전체 리스크 등록부 (Risk Register 요약)

| ID | 카테고리 | 영향 | 가능성 | 점수 | 우선순위 | 1차 담당 |
|---|---|---|---|---|---|---|
| R1 | 금융데이터 정합/오분류 | 5 | 4 | 20 | **P0** | `accountant` / `saas_admin` |
| R2 | 개인·결제정보 보안 | 5 | 3 | 15→**P0** | **P0** | `saas_admin` / `owner` |
| R3 | 권한 오용 | 4 | 3 | 12 | **P1** | `owner` / `saas_admin` |
| R4 | 예약 동시성·오버부킹 | 4 | 4 | 16 | **P0** | `saas_admin` / `manager` |
| R5 | 거래 매칭 오매칭 | 4 | 4 | 16 | **P0** | `accountant` |
| R6 | 정산 분쟁(강사료) | 3 | 3 | 9 | **P2** | `owner` / `accountant` |
| R7 | 법규/개인정보·전자금융 | 5 | 2 | 10→**P0** | **P0** | `saas_admin` / `owner` |
| R8 | CSV 신뢰성 | 3 | 4 | 12 | **P1** | `accountant` / `saas_admin` |
| R9 | SaaS 멀티테넌트 데이터 누수 | 5 | 2 | 10→**P0** | **P0** | `saas_admin` |
| R10 | 가용성·백업 | 4 | 2 | 8 | **P2** | `saas_admin` |

> 화살표(→)는 §1.1 규칙에 따라 영향도 5로 인한 **P0 승격**을 표시한다.

---

## 2. R1 — 금융데이터 정합/오분류 (P0)

> **한 줄**: 매출(`revenue_records`)·비용(`expense_records`)·수강권 잔여(`passes`)·결제(`payments`)의 숫자가 원장·집계·대시보드 사이에서 어긋나거나, 매출/비용이 잘못된 기준·카테고리로 인식되는 리스크. 본 솔루션의 핵심 가치(수익분석)를 직접 훼손한다.

| 항목 | 내용 |
|---|---|
| 영향도 | 5 — 원장이 보는 영업이익·현금흐름 수치가 틀리면 경영 의사결정 자체가 오염 |
| 발생가능성 | 4 — 이중 손익·차감·환불·라운딩이 얽혀 상시 발생 여지 |
| 점수/우선순위 | 20 / **P0** |
| 1차 담당 | `accountant`(분류·정합 검증) / `saas_admin`(정합성 배치·제약 구현) |

### 2.1 세부 리스크와 산식

이중 손익 모델([`00-canon.md`](./00-canon.md) §4)이 핵심 위험 지점이다. 같은 결제를 **결제기준(`payment`) 1건**과 **소진기준(`consumption`) N건**으로 인식하는데, 합산 시 기준을 섞으면 **이중계상**된다.

| 세부 리스크 | 잘못된 결과 | 정확한 규칙 |
|---|---|---|
| 두 기준 혼합 합산 | 매출 2배 부풀림 | 항상 단일 `revenue_basis`로만 합산. 대시보드는 토글로 한 기준만 표시([`10-profit-dashboard.md`](./10-profit-dashboard.md)) |
| 소진 단가 라운딩 잔차 | Σ(소진단가) ≠ 결제액 | `unit_price_amount = round(final_amount / total_count)`, 잔차는 **마지막 소진 회차에 보정** |
| 환불 부호 오류 | 순매출 과대 | 환불은 `source_type='refund'`, `amount = -refund_amount`(음수 1건) |
| `remaining_count` 직접수정 | 잔여 ≠ 원장 누적 | 잔여는 **`pass_transactions` 누적으로만** 변경([`15-pass-policy.md`](./15-pass-policy.md)) |
| 비용 cost_type 오분류 | 고정비/변동비 왜곡 → 손익구조 오판 | `expense_categories.default_cost_type` 기본 + 규칙 기반(§3 R5) |

**정합성 핵심 등식(불변식):**

```
[수강권]  passes.remaining_count
          == 마지막 pass_transactions.balance_after            (회원·수강권별)

[소진합]  Σ revenue_records.amount (basis=consumption, pass별)
          == Σ |pass_transactions.delta(차감)| × unit_price_amount   (±라운딩 보정)

[결제↔매출] payments.paid_amount
          == revenue_records.amount (basis=payment, source=payment, 해당 payment)

[미수금]  payments.receivable_amount == payments.amount − payments.paid_amount  (≥ 0)

[카드]    card_sales.net_deposit_amount == card_sales.amount − card_sales.fee_amount
```

### 2.2 PDMR 대응

| 단계 | 대응 |
|---|---|
| **예방** | (1) `revenue_records`·`pass_transactions`·`audit_logs`는 **append-only**(수정·물리삭제 금지, `deleted_at` 미사용). (2) 금액은 전부 BIGINT(원), float 금지([`00-canon.md`](./00-canon.md) §1.3). (3) DB CHECK: `receivable_amount >= 0`, `paid_amount <= amount`, `remaining_count >= 0`, `balance_after >= 0`. (4) 차감/복구/환불은 **트랜잭션 1건**으로 원장+잔여+매출인식을 함께 처리(부분 반영 금지). |
| **탐지** | (1) **야간 정합성 배치**가 §2.1 불변식을 테넌트·수강권 단위로 검산하고 위반 시 `audit_logs`(action=`update` 불일치 플래그)와 운영 알림 생성. (2) 대시보드에 "원장 합 vs 집계 합" 대조 위젯. (3) `Σ소진단가 − 결제액`의 절대 잔차가 라운딩 허용치(`< total_count원`) 초과 시 경고. |
| **완화** | 불일치 발견 시 해당 수강권/결제를 **"검증보류" 플래그**로 묶어 대시보드 집계에서 격리(잘못된 수치가 경영판단에 쓰이는 것을 차단)하고, 정정 전까지 해당 행만 회색 표시. |
| **복구** | 잘못된 인식은 **역분개(reverse) 레코드**로 상쇄(원장 수정 금지). 예: 잘못 인식된 소진매출 +10,000을 -10,000 보정 레코드(`source_type='refund'` 또는 수동 조정)로 추가하고 `audit_logs`에 사유 기록. 심각 시 PITR로 해당 트랜잭션 직전 복원(§11 R10). |

### 2.3 audit_logs 연결

모든 금전 변경은 [`00-canon.md`](./00-canon.md) §1·§5에 따라 `audit_logs`에 `action ∈ {update, delete, refund, pass_adjust}`로 기록된다. 정정 시 `before_json`/`after_json`에 변경 전후 금액을 남겨 **감사 추적**을 보장한다.

---

## 3. R2 — 개인·결제정보 보안 (P0)

> **한 줄**: 회원 개인정보(연락처·생년월일·의료메모)·결제정보(카드 승인번호·입금자명·계좌)·재무정보가 외부 유출 또는 내부 부정열람되는 리스크.

| 항목 | 내용 |
|---|---|
| 영향도 | 5 — 개인정보보호법·신용정보법 위반, 신뢰 붕괴 |
| 발생가능성 | 3 |
| 점수/우선순위 | 15 → **P0 승격**(영향도 5) |
| 1차 담당 | `saas_admin`(인프라·암호화·접근통제) / `owner`(테넌트 내 내부통제) |

### 3.1 민감 데이터 분류와 보호

| 민감도 | 데이터 | 위치 | 보호 |
|---|---|---|---|
| 최상 | `password_hash`, `credential_ref`(외부연동 시크릿) | `users`, `external_integrations` | 단방향 해시(bcrypt/argon2), 시크릿은 **DB 미저장**(시크릿 매니저 참조만) |
| 높음 | `card_approval_no`, `account_no_masked`, `business_no` | `payments`, `bank_accounts`, `tenants` | 저장 시 마스킹/부분암호화, 평문 노출 금지 |
| 높음 | `medical_note`(통증/주의), `birth_date`, `phone` | `members` | 컬럼 암호화/접근 역할 제한(§3.2), 로그에 평문 금지 |
| 중간 | `marketing_source`, `memo`, `goal` | `members`, `leads` | 역할 기반 노출 |

> **PCI 회피 설계**: 온라인 결제(PG)는 2~3차 기능이며, 도입 시에도 **카드 전체번호·CVC·비밀번호는 절대 저장하지 않는다**(PG 토큰/승인번호만 보관). MVP의 현장 카드결제는 `card_approval_no`만 기록한다([`16-payment-refund-policy.md`](./16-payment-refund-policy.md)).

### 3.2 PDMR 대응

| 단계 | 대응 |
|---|---|
| **예방** | (1) **전송 암호화**: 전 구간 TLS. (2) **저장 암호화**: DB at-rest 암호화 + 민감 컬럼 애플리케이션 레벨 암호화. (3) **RBAC 필드 분리**([`13-rbac.md`](./13-rbac.md)): `accountant`는 의료메모·연락처 **마스킹**, `instructor`는 담당(`assigned`) 회원만, `member`는 본인(`own`)만. (4) **최소권한**: 직원 계정은 역할별 최소 스코프, 시크릿은 시크릿 매니저로 분리. (5) 비밀번호 정책·MFA(특히 `owner`/`accountant`/`saas_admin`). |
| **탐지** | (1) **모든 조회·내보내기(export)도 감사**: `audit_logs.action ∈ {export, login}` + 민감 리소스 read 샘플링. (2) **비정상 패턴 탐지**: 단시간 대량 회원 조회/대량 export → 알림. (3) `external_integrations.status=error`·로그인 실패 누적 모니터. |
| **완화** | (1) 의심 계정 즉시 `users.status='suspended'` + 세션 강제만료. (2) 유출 의심 데이터 범위를 `audit_logs`로 즉시 산정(누가 무엇을 언제 조회). (3) 화면·CSV export는 기본 마스킹, 평문 추출은 별도 권한·재인증. |
| **복구** | (1) 자격증명 일괄 회전(비밀번호·시크릿·토큰). (2) 침해 시 **개인정보보호법상 통지·신고 절차**(§8 R7과 연계, 인지 후 법정 기한 내). (3) 영향받은 회원 고지·재발방지 보고. |

---

## 4. R3 — 권한 오용 (P1)

> **한 줄**: 역할 경계를 넘어 데이터를 보거나(강사가 전체 매출·통장 잔액 열람 등), 권한 상향(escalation)·대리조작이 일어나는 리스크.

| 항목 | 내용 |
|---|---|
| 영향도 | 4 |
| 발생가능성 | 3 |
| 점수/우선순위 | 12 / **P1** |
| 1차 담당 | `owner`(테넌트 내 권한 부여) / `saas_admin`(권한 모델 구현) |

### 4.1 핵심 하드 규칙(위반 시 즉시 거부)

[`13-rbac.md`](./13-rbac.md) §2의 하드 규칙을 리스크 관점으로 재확인한다.

| 규칙 | 위반 예시 | 통제 |
|---|---|---|
| 강사 ≠ 전체 매출·통장 | `instructor`가 `bank_accounts.balance_amount` 조회 | 리소스 **전면 차단**(403), 시도 자체를 `audit_logs` 기록 |
| 회계 ≠ 회원 의료메모 | `accountant`가 `members.medical_note` 조회 | 마스킹/거부 |
| 회원 = 본인만 | `member`가 타 회원 예약 조회 | `own` 스코프 강제, FK 불일치 거부 |
| 격리 우선 | 타 테넌트/스튜디오 행 접근 | 권한검사보다 **먼저** 격리 게이트(§9 R9) |

### 4.2 PDMR 대응

| 단계 | 대응 |
|---|---|
| **예방** | (1) 권한 = `permissions(role_code × resource × action × scope)` **서버측 강제**(클라이언트 신뢰 금지). (2) 스코프 필터를 **쿼리 레벨**에 주입(`tenant_id`+`studio_id`+scope). (3) 위험 액션(환불·수강권 수동조정·대량 export)은 역할 + 재확인. (4) 역할 변경은 `owner`/`saas_admin`만, 본인 역할 상향 금지. |
| **탐지** | (1) **모든 수정/삭제/환불/수강권 차감**은 `audit_logs` 필수([`00-canon.md`](./00-canon.md) §5). (2) `actor_role`과 대상 리소스 매트릭스 위반(권한 외 액션 시도) 카운트 → 알림. (3) 비업무시간 민감 액션 모니터. |
| **완화** | 권한 외 시도가 반복되는 계정은 자동 `suspended` 후보로 표시, `owner`에 통지. |
| **복구** | 부정 변경은 `audit_logs.before_json`으로 **역적용 정정**, 책임자 식별, 권한 재설정. |

---

## 5. R4 — 예약 동시성·오버부킹 (P0)

> **한 줄**: 정원 1석에 동시 예약이 몰려 **정원 초과(오버부킹)**가 발생하거나, 대기 자동전환·취소 처리가 경합으로 잔여횟수를 **이중 차감/복구**하는 리스크.

| 항목 | 내용 |
|---|---|
| 영향도 | 4 — 현장 분쟁, 차감 오류로 금전 정합 훼손 |
| 발생가능성 | 4 — 인기 시간대 동시 클릭 상시 |
| 점수/우선순위 | 16 / **P0** |
| 1차 담당 | `saas_admin`(동시성 제어 구현) / `manager`(현장 조정) |

### 5.1 동시성 시나리오

| 시나리오 | 위험 | 통제 |
|---|---|---|
| 잔여석 1, 동시 예약 2건 | 정원 초과 | 행 잠금 + `COUNT(booked) < capacity` 원자적 검사 |
| 대기 자동전환 + 회원 취소 동시 | 한 자리 2명 확정 | `class_session` 단위 직렬화(advisory/row lock) |
| 같은 회원 더블클릭 | 1수업 2예약, 2회 차감 | `UNIQUE(member_id, class_session_id, status활성)` |
| 1일 예약 한도 경합 | `daily_booking_limit` 초과 | 한도 검사 트랜잭션 내 수행 |
| 차감 후 예약 실패 롤백 | 잔여 부정확 | 예약+차감 **단일 트랜잭션**(원자성) |

### 5.2 차감/복구 멱등 원칙

수강권 차감([`15-pass-policy.md`](./15-pass-policy.md))은 **멱등**해야 한다. 같은 예약·출석 이벤트가 재시도되어도 `pass_transactions`에 **중복 레코드가 쌓이지 않도록** `reservation_id`/`attendance_id` 기준 멱등 키를 둔다.

```
예약(차감) 트랜잭션(원자):
  BEGIN
    SELECT ... FROM class_sessions WHERE id=:sid FOR UPDATE       -- 회차 잠금
    booked := COUNT(reservations WHERE session=:sid AND status='booked')
    IF booked >= capacity THEN  → waitlist 처리(또는 거부)
    ELSE
      INSERT reservations(... status='booked')                     -- UNIQUE 보장
      INSERT pass_transactions(reason='deduct_booking', delta=-1,
                               balance_after=remaining-1)           -- 멱등키=reservation_id
      UPDATE passes SET remaining_count = remaining_count - 1
            WHERE id=:pid AND remaining_count > 0                   -- CHECK >= 0
    END
  COMMIT
```

> 차감 시점(`on_booking`/`on_attend`)은 `studios.policy_json.deduct_timing`을 따른다([`00-canon.md`](./00-canon.md) §6.1). 어떤 시점이든 위 원자성·멱등 원칙은 동일하게 적용한다.

### 5.3 PDMR 대응

| 단계 | 대응 |
|---|---|
| **예방** | 회차 단위 행잠금/직렬화, 예약-차감 단일 트랜잭션, `UNIQUE`·`CHECK` 제약, 한도검사 트랜잭션 내 수행. |
| **탐지** | (1) `COUNT(active reservations) > capacity` 회차 탐지 배치. (2) 동일 `reservation_id`에 차감/복구 짝 불일치 탐지. (3) 잔여횟수 음수 시도 = CHECK 위반 로그. |
| **완화** | 오버부킹 적발 회차는 자동 **대기 전환**으로 초과분 재배치, 현장 `manager`에 알림. 결원 발생 시 `waitlist_auto_promote`로 1순위 자동 확정([`14-booking-policy.md`](./14-booking-policy.md)). |
| **복구** | 이중 차감은 `restore`(복구) 보정 레코드로 잔여 정정 + `audit_logs(action=pass_adjust)`. |

---

## 6. R5 — 거래 매칭 오매칭 (P0)

> **한 줄**: 통장 입금↔회원 결제, 카드매출↔통장입금, 거래처명↔비용 카테고리 자동매칭이 **틀린 대상에 연결**되어 매출/비용/미수금이 왜곡되는 리스크.

| 항목 | 내용 |
|---|---|
| 영향도 | 4 — 매출·비용 오분류 → R1로 전이 |
| 발생가능성 | 4 — 동명이인·금액 일치·거래처명 변형 빈번 |
| 점수/우선순위 | 16 / **P0** |
| 1차 담당 | `accountant` |

### 6.1 오매칭 유형

[`17-reconciliation-policy.md`](./17-reconciliation-policy.md)·[`18-expense-category-policy.md`](./18-expense-category-policy.md)와 연계한다.

| 유형 | 예시 | 위험 |
|---|---|---|
| 동명이인 입금자 | "김민수" 입금 2명 | 다른 회원 결제에 매칭 → 한쪽 미수 오인 |
| 금액 우연 일치 | 같은 가격 수강권 다건 | 엉뚱한 결제 매칭 |
| 자동분류 규칙 과적합 | "스타벅스" → `meal` 고정인데 실제 거래처 변형 | 비용 카테고리 오분류 |
| 내부이체 매출 오인 | 사장 개인↔사업자 이체 | `transfer`인데 `revenue`로 분류 |
| 카드매출 단계 누락 | 승인만 있고 입금 매칭 안 됨 | 미입금 카드매출 과대/과소 |

### 6.2 자동매칭 신뢰도 + 사람 확인 게이트

자동매칭은 **추천(suggestion)**이며, **금전 확정은 사람의 승인**을 거친다. 신뢰도 점수로 자동확정/검토대기를 가른다.

```
매칭 신뢰도 = w1·금액일치 + w2·날짜근접 + w3·이름/거래처 유사 + w4·규칙히트
  - 신뢰도 ≥ 임계1  → 자동매칭 후보(검토대기, is_matched=false 유지)
  - 임계2 ≤ 신뢰도 < 임계1 → 후보 목록(수동 선택)
  - 신뢰도 < 임계2 → 미매칭 큐(별도 격리)
```

> **원칙**: 자동 규칙은 *분류*까지만 자동화하고, **회원 결제↔통장입금 같은 금전 확정은 `accountant`/`owner`가 승인**한다. 관리자가 수정한 분류 규칙(`transaction_matching_rules`)은 [`_source-requirements.md`](./_source-requirements.md) §7대로 **다음 거래부터 자동 적용**(소급 자동변경 금지, 과거분은 별도 일괄 처리 + 감사).

### 6.3 PDMR 대응

| 단계 | 대응 |
|---|---|
| **예방** | (1) 자동매칭은 추천만, 금전 확정은 사람 승인. (2) `transaction_matching_rules.priority`로 충돌 규칙 결정. (3) `match_target='transfer'`(내부이체) 식별 규칙 우선 적용. (4) 카드매출 3단계(`approved/captured/deposited`, [`00-canon.md`](./00-canon.md) §3.21) 강제 추적. |
| **탐지** | (1) **미매칭 큐**를 대시보드 상시 노출(`is_matched=false`). (2) 신뢰도 낮은 자동분류 목록 검토 알림. (3) `card_sales` 중 `reconciliation_stage != deposited` 금액 = 미입금 카드매출 지표로 상시 감시. |
| **완화** | 오매칭 의심 거래는 **언매칭(unmatch)** 후 미매칭 큐로 되돌려 격리, 집계에서 제외. |
| **복구** | `transaction_reconciliation_logs`에 `before_json`/`after_json`으로 매칭 이력 보관 → **재분류(reclassified)**로 정정, 연결된 `revenue_records`/`expense_records`도 역분개로 보정(§2 R1 복구 절차 준용). |

### 6.4 매칭 감사

매칭/언매칭/재분류는 모두 `transaction_reconciliation_logs`(action=`auto_matched`/`manual_matched`/`unmatched`/`reclassified`)와 `audit_logs`에 이중 기록한다(누가·언제·어떤 규칙으로).

---

## 7. R6 — 정산 분쟁(강사료) (P2)

> **한 줄**: 강사료 정산(`settlements`)의 수업 수·단가·기여도 산정 근거가 불명확해 강사와 분쟁이 생기는 리스크.

| 항목 | 내용 |
|---|---|
| 영향도 | 3 |
| 발생가능성 | 3 |
| 점수/우선순위 | 9 / **P2** |
| 1차 담당 | `owner` / `accountant` |

### 7.1 정산 근거의 단일 출처

정산 분쟁의 본질은 "**무슨 수업이 카운트되었나**"의 불투명이다. 카운트 기준을 **출석(`attendance`) 원장**으로 고정한다.

| 산정 요소 | 단일 출처 | 산식 |
|---|---|---|
| 수업 수 | `attendance` (attended 기준) | `session_count = COUNT(attendance WHERE status='attended' AND instructor=:me AND 기간)` |
| 강사 귀속 | `class_sessions.instructor_staff_id` (대체 시 `substitute_staff_id`) | 실제 진행 강사 기준 |
| 강사료 | `settlements` | `total_amount = base_amount + bonus_amount − deduction_amount` |
| 기여도(재등록 등) | `leads`/`revenue_records` | 담당(`assigned_staff_id`) 매출·전환 집계 |

> 정산 금액은 [`00-canon.md`](./00-canon.md) §2-26대로 `settlements`에 ★필드(`base_amount`/`bonus_amount`/`deduction_amount`/`total_amount`)로 분해 저장하여 **항목별로 설명 가능**해야 한다.

### 7.2 PDMR 대응

| 단계 | 대응 |
|---|---|
| **예방** | (1) 정산 카운트 기준을 출석 원장으로 단일화(예약/노쇼 포함 여부를 정책으로 명문화). (2) 대체 강사 수업은 `substitute_staff_id`로 귀속 분리. (3) 정산 상태머신 `draft → confirmed → paid`, **`confirmed` 이후 산정 변경 금지**(변경 시 새 보정 항목). |
| **탐지** | 강사 본인은 [`13-rbac.md`](./13-rbac.md)대로 **본인 정산(`own`)·담당 매출(`assigned`)만 조회** 가능 → 강사가 자기 근거 수업 목록을 직접 검증. 불일치 신고 시 `attendance` 대조. |
| **완화** | 분쟁 항목은 `deduction_amount`/`bonus_amount`로 별도 정산 항목 추가, 본 정산 금액은 불변. |
| **복구** | `settlements`의 항목별 분해 + `attendance` 회차 리스트로 근거 제시, 합의 후 보정 항목 + `audit_logs`. |

---

## 8. R7 — 법규/개인정보·전자금융 (P0)

> **한 줄**: 개인정보보호법·신용정보법·전자금융거래법·전자상거래법(환불·청약철회)·세무 관련 규제 위반 리스크. SaaS·금융연동 확장 시 가중된다.

| 항목 | 내용 |
|---|---|
| 영향도 | 5 — 과징금·서비스 정지·형사책임 |
| 발생가능성 | 2 |
| 점수/우선순위 | 10 → **P0 승격**(영향도 5) |
| 1차 담당 | `saas_admin`(플랫폼 컴플라이언스) / `owner`(사업자 의무) |

### 8.1 규제 영역별 대응

| 규제 영역 | 핵심 의무 | 본 솔루션 설계 대응 |
|---|---|---|
| 개인정보보호 | 수집·이용 동의, 목적 외 이용 금지, 파기, 접근통제, 유출통지 | 동의 관리, RBAC 분리(R2/R3), `audit_logs` 조회기록, 소프트삭제 후 보존기간 만료 시 파기 배치 |
| 신용정보/결제 | 카드정보 보호, PCI 회피 | 카드 전체번호·CVC 미저장, 승인번호·마스킹만(R2 §3.1) |
| 전자금융거래 | 오픈뱅킹·금융연동 시 인증·전송·기록 | `external_integrations`/`sync_logs`로 연동·실패 기록, 3차 도입 전 적격 PG·인증기관 경유 |
| 전자상거래(환불) | 청약철회·환불 산정 고지 | [`16-payment-refund-policy.md`](./16-payment-refund-policy.md)의 환불 산식·위약공제율(`refund_penalty_rate`) 명문화, 환불 `audit_logs` |
| 세무 | 매출 신고, 세금계산서, 증빙 보관 | `financial_reports`(tax_export), 증빙 `receipt_file_url`·`doc_memo`, 보존기간 동안 물리삭제 금지 |
| 데이터 주권 | 국내 보관 | 인프라 리전·백업 위치를 국내로 한정(SaaS) |

### 8.2 보존·파기 정책

금전·감사 데이터는 **소프트삭제 후 법정 보존기간까지 보관**하고, 만료 시에만 파기한다([`00-canon.md`](./00-canon.md) §1.2: 물리삭제 금지, `deleted_at`).

```
보존 규칙:
  - audit_logs / payments / refunds / revenue_records / expense_records
        → append-only 또는 soft-delete, 법정 보존기간 경과 전 파기 금지
  - members 개인정보 → 동의 철회·계약 종료 + 보존의무 만료 시 파기 배치
파기 시에도 audit_logs에 파기 사실 기록(역설적 보존)
```

### 8.3 PDMR 대응

| 단계 | 대응 |
|---|---|
| **예방** | 동의·약관·개인정보처리방침 관리, 데이터 국내보관, PCI 회피 설계, 3차 금융연동 전 법무 검토. |
| **탐지** | 보존기간 만료 데이터 스캔, 동의 없는 처리 탐지, `audit_logs` 기반 목적 외 이용 점검. |
| **완화** | 위반 소지 기능은 **플래그로 비활성화**(예: 미인증 금융연동 차단), 회로차단. |
| **복구** | 침해 시 법정 기한 내 통지·신고(R2 §3.2 연계), 시정조치 보고, 재발방지 정책 갱신. |

---

## 9. R8 — CSV 신뢰성 (P1)

> **한 줄**: 통장·카드 CSV 업로드가 인코딩·포맷·중복·열 매핑 오류로 **잘못 적재**되거나, 같은 파일이 **이중 업로드**되어 거래가 중복 계상되는 리스크.

| 항목 | 내용 |
|---|---|
| 영향도 | 3 |
| 발생가능성 | 4 — 은행/카드사별 포맷 상이, EUC-KR/UTF-8 혼재 상시 |
| 점수/우선순위 | 12 / **P1** |
| 1차 담당 | `accountant` / `saas_admin`(파서) |

### 9.1 CSV 위험 요인과 통제

| 위험 | 통제 |
|---|---|
| 인코딩 깨짐(EUC-KR/UTF-8/BOM) | 인코딩 자동감지 + 미리보기, 깨짐 시 업로드 차단 |
| 열 매핑 불일치(은행별 컬럼순서) | 은행/카드사별 매핑 프로파일, 업로드 전 컬럼 매핑 확인 화면 |
| 금액 부호/천단위 | 정수(원) 파싱, 입금+/출금− 방향(`direction`) 명시 검증 |
| **이중 업로드** | `import_batch_id` + 거래 지문(date+amount+counterparty) **중복키 차단** |
| 부분 실패 | 행 단위 검증, 실패행 리포트, **전부 또는 검증통과분만** 적재 |
| 미래/과거 비정상 날짜 | 날짜 범위 검증, 이상치 경고 |

### 9.2 멱등 업로드 설계

```
업로드 처리:
  1) 파일 해시 + import_batch_id 발급
  2) 행별 지문 = hash(txn_date, amount, counterparty_name, direction)
  3) 기존 지문과 대조:
        중복 → skip (중복계상 방지)
        신규 → bank_transactions / card_expenses INSERT
  4) 검증 실패행 → 오류 리포트(사유별), 적재 제외
  5) 결과 요약: 신규 N / 중복 M / 실패 K  (감사 기록)
```

> 적재된 거래는 **미매칭 상태(`is_matched=false`)**로 들어가 R5의 매칭 게이트를 거친다. 즉 CSV 적재 ≠ 매출/비용 확정.

### 9.3 PDMR 대응

| 단계 | 대응 |
|---|---|
| **예방** | 인코딩 감지·매핑 프로파일·중복지문 차단·행 단위 검증·미리보기 확인. |
| **탐지** | 업로드 결과 요약(신규/중복/실패), 이상치(중복률 높음·금액 0 다수) 경고, `sync_logs`/`import_batch_id` 추적. |
| **완화** | 잘못된 배치는 **배치 단위 롤백**(같은 `import_batch_id` 일괄 무효화), 미매칭 단계라 집계 영향 없음. |
| **복구** | 배치 무효화 후 재업로드, 감사 기록. 이미 매칭·인식된 건은 R5/R1 복구 절차 준용. |

---

## 10. R9 — SaaS 멀티테넌트 데이터 누수 (P0)

> **한 줄**: 한 테넌트/스튜디오 사용자가 **다른 테넌트의 회원·매출·결제·통장 데이터**를 보거나, 집계가 테넌트 경계를 넘어 섞이는 리스크. SaaS의 가장 치명적 사고.

| 항목 | 내용 |
|---|---|
| 영향도 | 5 — 타 사업자 영업기밀·개인정보 유출, 계약 위반 |
| 발생가능성 | 2 |
| 점수/우선순위 | 10 → **P0 승격**(영향도 5) |
| 1차 담당 | `saas_admin` |

### 10.1 격리 모델

[`00-canon.md`](./00-canon.md) §1.2·§5·[`20-saas-architecture.md`](./20-saas-architecture.md)의 격리를 리스크 관점에서 못박는다. **모든 업무 데이터 테이블은 `tenant_id` + `studio_id`를 보유**하며, 이 필터는 **권한검사보다 먼저** 적용되는 하드 게이트다.

```
모든 쿼리 불변식(예외 없음, 글로벌 테이블 제외):
    WHERE tenant_id = :current_tenant AND studio_id ∈ :allowed_studios
    AND deleted_at IS NULL

글로벌 테이블(tenant_id 미보유 허용):
    tenants, subscription_plans  (그 외 모든 테이블은 tenant_id 필수)
```

| 누수 경로 | 통제 |
|---|---|
| 애플리케이션 쿼리 누락 | ORM/리포지토리에 **테넌트 필터 강제 주입**(글로벌 미들웨어), 직접 SQL 금지 |
| DB 레벨 | Row-Level Security(RLS)로 `tenant_id` 강제(이중 방어) |
| 집계/리포트 | `financial_reports`·대시보드 집계 쿼리도 동일 필터 적용 |
| 객체 스토리지(증빙/리포트) | 파일 경로/권한에 `tenant_id` 네임스페이스 |
| `saas_admin` 조회 | 글로벌 권한이나 업무데이터는 조회 위주 + 접근 전부 `audit_logs(export/read)` |

### 10.2 PDMR 대응

| 단계 | 대응 |
|---|---|
| **예방** | (1) 미들웨어 테넌트 필터 강제 + DB RLS 이중방어. (2) FK 무결성: 자식 행의 `tenant_id`/`studio_id`가 부모와 일치하는지 제약. (3) 캐시 키·파일 경로에 `tenant_id` 포함(캐시 교차 방지). (4) 신규 테이블 추가 시 격리 체크리스트([`22-qa-checklist.md`](./22-qa-checklist.md)). |
| **탐지** | (1) **테넌트 누락 쿼리 정적분석/테스트**(필터 없는 쿼리 CI 차단). (2) `audit_logs`에서 `actor`의 `tenant_id`와 `entity`의 `tenant_id` 불일치 탐지. (3) `saas_admin` 외 글로벌 접근 시도 알림. |
| **완화** | 누수 의심 즉시 해당 엔드포인트 차단(기능 플래그), 영향 테넌트 범위를 `audit_logs`로 산정. |
| **복구** | 취약 경로 패치·재배포, 노출 데이터 범위 통지(R2/R7 연계), 회귀 테스트 추가. |

---

## 11. R10 — 가용성·백업 (P2)

> **한 줄**: 시스템 장애·외부연동 실패·데이터 손상으로 서비스가 중단되거나 데이터가 유실되는 리스크. 예약·결제 같은 실시간 업무가 막히면 현장 운영이 정지한다.

| 항목 | 내용 |
|---|---|
| 영향도 | 4 |
| 발생가능성 | 2 |
| 점수/우선순위 | 8 / **P2** |
| 1차 담당 | `saas_admin` |

### 11.1 가용성·복구 목표

| 지표 | 정의 | 목표(초기) |
|---|---|---|
| **RPO**(목표 복구 시점) | 허용 데이터 손실 폭 | ≤ 15분 (PITR 기반) |
| **RTO**(목표 복구 시간) | 장애~정상 복구 시간 | ≤ 1시간(앱), ≤ 4시간(전체) |
| 백업 주기 | 전체 백업 | 일 1회 + WAL 연속 아카이브(PITR) |
| 백업 보관 | 보관 기간 | 30일 롤링 + 월말 스냅샷 장기보관 |
| 복원 훈련 | 복원 리허설 | 분기 1회(복원 성공 검증) |

### 11.2 외부연동 장애 격리

[`00-canon.md`](./00-canon.md) §2의 `external_integrations`·`sync_logs`를 활용해 **외부(오픈뱅킹/PG/알림톡/카드조회) 장애가 코어 업무를 막지 않도록** 격리한다.

| 외부 연동 | 장애 시 코어 영향 | 격리 |
|---|---|---|
| 알림톡/SMS | 발송 실패 | `notifications.status='failed'` + 재시도 큐, 예약 자체는 진행 |
| 오픈뱅킹/카드조회 | 동기화 실패 | `sync_logs.status='failed'`, **CSV 업로드(MVP)로 폴백** |
| PG(3차) | 결제 승인 실패 | 현장카드/계좌이체로 폴백, 멱등 결제키로 중복승인 방지 |

> 외부연동은 **회로차단(circuit breaker) + 재시도 + 폴백**으로 감싸고, 실패는 `sync_logs`에 누적해 R1/R5 정합에 영향 없게 한다.

### 11.3 PDMR 대응

| 단계 | 대응 |
|---|---|
| **예방** | (1) 자동 백업(일 1회 + 연속 WAL). (2) 다중 가용영역 배치, 무중단 배포. (3) 외부연동 회로차단·타임아웃·폴백. (4) 멱등 처리(결제·차감·매칭·알림). |
| **탐지** | (1) 헬스체크·업타임 모니터·에러율·지연 알림. (2) 백업 성공 여부 일 단위 확인(실패 시 알림). (3) `sync_logs.status` 실패율 모니터. |
| **완화** | 장애 시 읽기전용/축소 모드, 알림·동기화는 큐 지연 처리, 현장 업무는 폴백 경로 유지. |
| **복구** | (1) **PITR로 손상 직전 시점 복원**(RPO 준수). (2) 복원 후 §2 R1 정합성 배치 재실행으로 무결성 검증. (3) 사후 분석(postmortem)·재발방지. |

---

## 12. 공통 통제 매핑 (Cross-cutting Controls)

리스크별 대응은 아래 **4개 공통 통제**로 수렴한다. 신규 기능 추가 시 이 4개를 점검하면 대부분의 리스크가 1차 차단된다.

| 공통 통제 | 정의(canon 근거) | 커버하는 리스크 |
|---|---|---|
| **`audit_logs` 전수기록** | 모든 수정/삭제/환불/수강권 차감/매칭/로그인/export 기록([`00-canon.md`](./00-canon.md) §1·§5, 38번 테이블) | R1·R2·R3·R5·R6·R7·R9 |
| **RBAC + 테넌트 격리** | role×resource×action×scope + `tenant_id`/`studio_id` 하드게이트([`00-canon.md`](./00-canon.md) §5, [`13-rbac.md`](./13-rbac.md)) | R2·R3·R9 |
| **검증 불변식 + DB 제약** | append-only 원장, CHECK/UNIQUE/FK, 단일 트랜잭션·멱등([`00-canon.md`](./00-canon.md) §1.3·§4) | R1·R4·R5·R8 |
| **백업·복구·역분개** | PITR 백업, 물리삭제 금지, reverse 보정([`00-canon.md`](./00-canon.md) §1.2) | R1·R6·R8·R10 |

### 12.1 우선순위별 액션 요약

| 우선순위 | 리스크 | 즉시 확보해야 할 통제 |
|---|---|---|
| **P0** | R1, R2, R4, R5, R7, R9 | 정합성 배치 · 민감정보 암호화/RBAC · 동시성 원자트랜잭션 · 매칭 사람승인 게이트 · 컴플라이언스/보존정책 · 테넌트 격리 RLS |
| **P1** | R3, R8 | 권한 서버측 강제·audit · CSV 멱등/중복차단 |
| **P2** | R6, R10 | 정산 근거 단일출처 · 백업/복원 리허설·외부연동 격리 |

### 12.2 정기 점검 루틴

| 주기 | 점검 항목 | 담당 |
|---|---|---|
| 일 | 정합성 배치 결과(R1), 백업 성공(R10), 미매칭 큐(R5), 동기화 실패(R10) | `saas_admin` / `accountant` |
| 주 | 권한 위반 시도 로그(R3), 비정상 조회/export(R2), CSV 업로드 이상치(R8) | `saas_admin` / `owner` |
| 월 | 정산 분쟁/보정(R6), 미입금 카드매출·미수금 추이(R1/R5), 보존기간 만료 데이터(R7) | `owner` / `accountant` |
| 분기 | 복원 리허설(R10), 권한 모델 재검토(R3/R9), 컴플라이언스 점검(R7) | `saas_admin` |

---

## 관련 문서

- [`00-canon.md`](./00-canon.md) — 단일 진실원천(스키마/enum/RBAC/회계모델/감사로그·소프트삭제 §1·§5)
- [`13-rbac.md`](./13-rbac.md) — 권한 정책(R2·R3·R9 통제 상세)
- [`14-booking-policy.md`](./14-booking-policy.md) — 예약/취소/노쇼/차감 정책(R4 동시성·차감 원장)
- [`15-pass-policy.md`](./15-pass-policy.md) — 수강권 정책(R1·R4 잔여 불변식)
- [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) — 결제/환불 정책(R1·R2·R7 환불·카드정보)
- [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) — 거래 매칭 정책(R5 오매칭)
- [`18-expense-category-policy.md`](./18-expense-category-policy.md) — 비용 카테고리 정책(R5 자동분류)
- [`19-metrics.md`](./19-metrics.md) — 수익분석 지표 정의(R1 산식·정합)
- [`20-saas-architecture.md`](./20-saas-architecture.md) — SaaS 아키텍처(R9 테넌트 격리·R10 가용성)
- [`22-qa-checklist.md`](./22-qa-checklist.md) — QA 체크리스트(리스크 검증 항목)
- [`_source-requirements.md`](./_source-requirements.md) — 원본 요구사항(정본 소스)
