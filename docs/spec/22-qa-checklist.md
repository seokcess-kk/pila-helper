# 22-qa-checklist.md — QA 체크리스트

> **목적**: 필라테스 경영관리 SaaS의 **출시 게이트(release gate)** 로 쓰는 모듈별 검증 체크리스트.
> 정상·경계·예외 케이스를 균형 있게 다루되, 이 솔루션의 생명선인 **금전 정확성**(차감·환불·미수금·이중기준 매출·거래 매칭 정합), **권한/보안**(역할별 차단·테넌트 격리·민감정보 노출), **예약/대기 동시성**, **CSV 파싱·중복**, **알림 트리거**를 최우선으로 검증한다.
> 모든 항목은 [`00-canon.md`](./00-canon.md)의 스키마·enum·회계모델·RBAC·정책 기본값을 **글자 단위 근거**로 삼는다. 수용기준은 [`05-scope-mvp.md`](./05-scope-mvp.md)와 연결한다.

---

## 0. 이 문서 사용법

### 0.1 용어와 표기

- **케이스 분류**: `[정상]` 기대 입력의 happy path / `[경계]` 임계값·0·최대·동시·경계시각 / `[예외]` 잘못된 입력·권한위반·동시 충돌·외부 실패.
- **심각도(Severity)**: `S0`(금전 손실·데이터 유실·보안 사고, 출시 차단) / `S1`(핵심 기능 불가, 출시 차단) / `S2`(우회 가능한 결함) / `S3`(미관·문구).
- **우선순위 게이트**: `S0`/`S1` 항목은 **전부 PASS여야 릴리스 가능**. 본 문서에서 ★표시 항목은 S0(금전·보안)이다.
- 체크 ID는 `QA-<모듈약자>-<번호>` 형식. 예: `QA-PAY-07`(결제 모듈 7번).
- 결과 기록: `PASS` / `FAIL` / `BLOCKED`(선행 결함으로 검증 불가) / `N/A`(범위 외).

### 0.2 검증 환경 전제(필수 시드 데이터)

| 항목 | 시드 구성 | 목적 |
|---|---|---|
| 테넌트 | `tenant_A`, `tenant_B` (각 2개 `studios`) | **테넌트/스튜디오 격리** 교차검증 |
| 사용자 | 역할 7종(`saas_admin`·`owner`·`manager`·`info_staff`·`instructor`·`accountant`·`member`) 각 1+ | RBAC 매트릭스(§00-canon §5) 검증 |
| 회원 | 상태 전이용 회원 8종(`new_inquiry`~`re_enrolled`) | `member_status` 전이 검증 |
| 수강권 | 잔여 0/1/2/N, `active`/`paused`/`expired`/`used_up` | 차감·만료·정지 경계 |
| 결제 | `paid`·`awaiting_deposit`·`partial`·`receivable`·`refunded` 각 1+ | 미수금·환불 산식 |
| 수업회차 | 정원=1(개인), 정원=N(그룹), 대기열 보유 | 동시성·대기 자동전환 |
| 거래내역 | 통장 CSV·카드 CSV(중복/깨진 행 포함) | 파싱·중복·매칭 |

### 0.3 회귀(regression) 트리거

아래 변경 시 **해당 모듈 + 금전 정합 쿼리(§14) + RBAC(§9)** 를 재실행한다.

- 차감 시점(`deduct_timing`)·정책 파라미터(`studios.policy_json`) 변경
- 환불 산식(`refund_penalty_rate`/`refund_unit_basis`) 변경
- `revenue_records` 적재 로직(이중기준) 변경
- 매칭 규칙(`transaction_matching_rules`) 우선순위·패턴 변경
- RBAC 권한표(`permissions`)·역할 추가 변경

---

## 1. 회원/CRM 모듈 (`members`·`leads`·`counseling_logs`·`marketing_sources`)

### 1.1 회원 등록·상태 전이

| ID | 케이스 | 검증 내용 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-MEM-01 | [정상] 신규 회원 등록 | 이름·`phone`·`gender`(male/female/other)·`birth_date`·`marketing_source` 입력 | 저장, `member_status='new_inquiry'`, `tenant_id`/`studio_id` 자동 주입 | S1 |
| QA-MEM-02 | [정상] 상태 전이 `new_inquiry`→`consulting`→`trial_booked`→`trial_done`→`enrolled` | 각 전이가 허용 흐름인지 | 정의된 순방향 전이만 허용, 이력 남음 | S1 |
| QA-MEM-03 | [경계] 만료 후 재등록 | `expired`→`re_enrolled` 전이 | `re_enrolled`로만 승격(다시 `enrolled` 아님), `is_re_enroll` 매출 플래그 연동 | S2 |
| QA-MEM-04 | [예외] 비정상 역방향 전이 | `enrolled`→`new_inquiry` 시도 | 거부 또는 별도 권한·사유 필요, `audit_logs` 기록 | S2 |
| QA-MEM-05 | [경계] 동일 `phone` 중복 등록 | 같은 번호 2회 등록 | 중복 경고(차단 아님: 가족/번호공유 허용) + 병합 후보 표시 | S2 |
| QA-MEM-06 | [정상] `leads`↔`members` 전환 연결 | 상담고객(lead) 등록 전환 시 | `leads.member_id` 연결, 동일 레코드 승격(중복 회원 미생성) | S1 |
| QA-MEM-07 | [정상] 태그 부여 | `no_show_risk`·`re_enroll_likely`·`expiring`·`receivable` 등 §3.17 코드 | 다대다 저장, UI 한글 라벨 표시, 저장값은 영문 코드 | S2 |
| QA-MEM-08 | [경계] `birth_date` 미래/과도 과거 | 2099년·1900년 이전 | 검증 거부 또는 경고 | S3 |

### 1.2 상담 파이프라인·전환율 근거

| ID | 케이스 | 검증 내용 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-CRM-01 | [정상] `lead_status` 전이 | `new_inquiry`→`contacted`→`trial_booked`→`trial_done`→`enrolled` | 각 날짜필드(`inquiry_date`/`trial_booked_date`/`trial_done_date`/`enrolled_date`) 자동 기록 | S1 |
| QA-CRM-02 | [정상] `lost` 처리 | `lost_reason` 필수 입력 | 사유 없이 `lost` 전이 불가 | S2 |
| QA-CRM-03 | [경계] 체험 등록전환율 분모 | `trial_done` 건수 대비 `enrolled` | 분모 0일 때 전환율 표시는 `–`(0 나눗셈 방지) | S1 |
| QA-CRM-04 | [정상] 유입경로 귀속 | `marketing_source` 코드별 집계 | §3.16 7종 코드 일치, `is_paid` 광고비 분석 연동 | S2 |
| QA-CRM-05 | [정상] 상담 리마인드 | `counseling_logs.next_action_at` 도래 | `counseling_reminder` 알림 트리거(§8) | S2 |

---

## 2. 수업/예약/출석 모듈 (`class_sessions`·`reservations`·`attendance`)

### 2.1 수업 회차·정원

| ID | 케이스 | 검증 내용 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-CLS-01 | [정상] 회차 생성 | `class_type`(personal/group/trial)·`start_at`/`end_at`·`capacity` | `[start_at, end_at)` 반열림 구간, `session_status='scheduled'` | S1 |
| QA-CLS-02 | [경계] 룸 동시 점유 충돌 | 같은 `room_id`·겹치는 시간대 2회차 | 충돌 경고(룸 capacity·동시수업 제약) | S2 |
| QA-CLS-03 | [정상] 강사 대체 배정 | `substitute_staff_id` 설정 | 대체강사 표시, 소진기준 매출의 `instructor_staff_id` 귀속 규칙 명확화(§10) | S2 |
| QA-CLS-04 | [경계] 자동 폐강 | 예약 < `auto_close_min_count`(기본 1) | 폐강 후보 표시 → 폐강 시 `session_status='canceled'` + 전원 `restore_close` 복구 | S1 |
| QA-CLS-05 | [정상] 타임존 판정 | 스튜디오 `timezone`(Asia/Seoul) | 예약오픈/마감/취소마감 계산이 스튜디오 타임존 기준(저장은 UTC) | S1 |

### 2.2 예약 생성·정책(정상/경계)

> 정책 기본값(§00-canon §6.1): `booking_open_days`=14, `booking_close_minutes`=60, `cancel_deadline_minutes`=120, `daily_booking_limit`=1, `deduct_timing`=`on_attend`.

| ID | 케이스 | 검증 내용 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-RSV-01 | [정상] 회원 직접 예약 | 모바일 웹, 잔여횟수 보유 회원 | `reservation_status='booked'`, `is_self_booked=true` | S1 |
| QA-RSV-02 | [정상] 관리자 대리 예약 | manager/info_staff가 대리 | `is_self_booked=false`, `created_by` 기록 | S2 |
| QA-RSV-03 | [경계] 예약 오픈 경계 | 시작 14일 0분 전 / 14일+1분 전 | 14일 이내만 예약 가능, 초과는 거부 | S2 |
| QA-RSV-04 | [경계] 예약 마감 경계 | 시작 60분 전 / 59분 전 | 60분 전 이후 예약 거부(`booking_close_minutes`) | S1 |
| QA-RSV-05 | [경계] 1일 예약 한도 | 같은 날 2번째 예약 시도 | `daily_booking_limit`=1 초과 거부 | S2 |
| QA-RSV-06 | [예외] 잔여 0 예약 | `remaining_count`=0인 `passes`로 예약 | 거부(차감 불가) — 단 `deduct_timing` 정책별 검증(§3) | S1★ |
| QA-RSV-07 | [예외] 만료 수강권 예약 | `pass_status='expired'`/`paused` | 거부 | S1★ |
| QA-RSV-08 | [예외] 허용 외 수업유형 | 그룹권으로 personal 예약 | `products.allowed_class_types` 불일치 거부 | S2 |

### 2.3 취소·노쇼·출석(차감 정합은 §3에서 집중)

| ID | 케이스 | 검증 내용 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-RSV-09 | [정상] 취소마감 전 취소 | 시작 120분+ 전 취소 | 무차감 취소, `reservation_status='canceled'`, `canceled_at` 기록 | S1★ |
| QA-RSV-10 | [경계] 취소마감 경계 | 시작 120분 정각 / 119분 전 | 120분 전까지 무차감, 이후 `late_cancel_deduct`=true면 차감 | S1★ |
| QA-RSV-11 | [정상] 출석 처리 | `attendance_status='attended'`, `deducted` 처리 | reservation 1:1, `deduct_timing=on_attend`면 이때 차감 | S1★ |
| QA-RSV-12 | [정상] 노쇼 처리 | `attendance_status='no_show'` | `no_show_deduct`=true면 차감, `no_show_risk` 태그 후보 | S1★ |
| QA-RSV-13 | [경계] 사유결석 면제 | `attendance_status='excused'` | 차감 면제 가능(`deducted=false`) | S2 |
| QA-RSV-14 | [예외] 이중 출석처리 | 같은 reservation 출석 2회 시도 | 멱등(idempotent), 차감 1회만, `audit_logs` 1건 | S0★ |

---

## 3. 수강권/차감 정합 (`passes`·`pass_transactions`) — 금전 정확성 핵심 ★

> **불변식(invariant)**: ① `passes.remaining_count = passes.total_count + Σ pass_transactions.delta`(전체 거래 합). ② `pass_transactions`는 append-only(수정·삭제 금지, 정정은 반대부호 신규 행). ③ 각 거래의 `balance_after`는 처리 직후 잔여와 일치. ④ `remaining_count`는 음수 불가.

### 3.1 차감 시점 정책(`deduct_timing`)

| ID | 케이스 | 검증 내용 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-PASS-01 | [정상] `on_attend` 출석차감 | 정책=on_attend, 출석 시 | `reason='deduct_attend'`, `delta=-1`, `balance_after` 갱신 | S0★ |
| QA-PASS-02 | [정상] `on_booking` 예약차감 | 정책=on_booking, 예약 시 | `reason='deduct_booking'`, `delta=-1` (예약 시점 차감) | S0★ |
| QA-PASS-03 | [예외] 정책 혼용 금지 | 한 스튜디오에서 두 reason 동시 발생 | 한 회차당 `deduct_booking` **또는** `deduct_attend` 중 하나만(중복 차감 금지) | S0★ |
| QA-PASS-04 | [정상] 취소복구 | 무차감 취소/폐강 시 | `reason='restore_cancel'`/`restore_close`, `delta=+1`, 원차감과 상쇄 | S0★ |
| QA-PASS-05 | [경계] 잔여 1회 → 0회 | 마지막 1회 차감 | `remaining_count=0`, `pass_status='used_up'` 전이 | S1★ |
| QA-PASS-06 | [예외] 잔여 0에서 차감 시도 | `remaining_count=0` 추가 차감 | 거부, 음수 불가, 트랜잭션 롤백 | S0★ |

### 3.2 수동 조정·복구 정합

| ID | 케이스 | 검증 내용 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-PASS-07 | [정상] 수동차감/복구 | `manual_deduct`/`manual_restore` | `memo` 필수, `created_by` 기록, `audit_logs`(action=`pass_adjust`) 1건 | S0★ |
| QA-PASS-08 | [예외] 거래 수정/삭제 시도 | 기존 `pass_transactions` 행 UPDATE/DELETE | 차단(append-only), 정정은 신규 반대부호 행으로만 | S0★ |
| QA-PASS-09 | [경계] 라운딩 잔차 | `unit_price_amount=round(final_amount/total_count)`, 잔차 발생 | 마지막 소진 회차 또는 조정 레코드로 보정, Σ소진액=결제액 ±0 | S0★ |
| QA-PASS-10 | [정상] 정지(홀딩) | `holdable`=true, `pass_status='paused'` | `paused_at` 기록, 정지 중 예약 불가, `paused_days_used` 누적 | S2 |
| QA-PASS-11 | [경계] 최대 정지일 초과 | 누적 정지 > `max_hold_days`(30) | 추가 정지 거부 또는 자동 재개 | S2 |
| QA-PASS-12 | [경계] 만료 처리 | `expire_date` 도래, 잔여>0 | `pass_status='expired'`, 잔여 소멸(또는 정책상 연장 안내) | S1★ |

### 3.3 차감 정합 검증 쿼리(예시)

```sql
-- (1) 수강권 잔여 정합: remaining_count 와 거래합이 어긋난 패스 적발
SELECT p.id AS pass_id, p.remaining_count,
       p.total_count + COALESCE(SUM(t.delta), 0) AS computed_remaining
FROM passes p
LEFT JOIN pass_transactions t ON t.pass_id = p.id AND t.deleted_at IS NULL
WHERE p.tenant_id = :tenant_id AND p.deleted_at IS NULL
GROUP BY p.id, p.remaining_count, p.total_count
HAVING p.remaining_count <> p.total_count + COALESCE(SUM(t.delta), 0);
-- 기대: 0 rows

-- (2) 음수 잔여 적발(절대 발생 불가)
SELECT id, remaining_count FROM passes
WHERE remaining_count < 0 AND tenant_id = :tenant_id;
-- 기대: 0 rows

-- (3) balance_after 연속성: 직전 거래의 balance_after + delta = 현재 balance_after
SELECT t.id, t.pass_id, t.balance_after,
       LAG(t.balance_after) OVER (PARTITION BY t.pass_id ORDER BY t.created_at) AS prev_balance,
       t.delta
FROM pass_transactions t
WHERE t.tenant_id = :tenant_id
QUALIFY t.balance_after
        <> COALESCE(LAG(t.balance_after) OVER (PARTITION BY t.pass_id ORDER BY t.created_at), t.balance_after - t.delta) + t.delta;
-- 기대: 0 rows  (QUALIFY 미지원 DB는 서브쿼리로 동등 변환)
```

---

## 4. 결제 모듈 (`purchases`·`payments`) — 미수금 정확성 ★

> **불변식**: ① `payments.receivable_amount = amount − paid_amount`(≥0). ② `payment_status`와 금액의 일관성: `paid`⇒`paid_amount=amount`·`receivable=0`; `partial`⇒`0<paid_amount<amount`; `receivable`⇒`paid_amount<amount`; `awaiting_deposit`⇒`paid_amount=0`. ③ `purchases.final_amount = list_amount − discount_amount`.

| ID | 케이스 | 검증 내용 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-PAY-01 | [정상] 현장 카드결제 | `payment_method='card_onsite'`, 전액 | `payment_status='paid'`, `card_approval_no` 입력, `card_sales` 연동(승인) | S1★ |
| QA-PAY-02 | [정상] 무통장입금 대기 | `transfer`, 입금 전 | `awaiting_deposit`, `depositor_name` 기록, 매출 미인식(또는 `on_deposit` 정책) | S1★ |
| QA-PAY-03 | [정상] 입금 확정 | 통장거래 매칭으로 입금 확인 | `awaiting_deposit`→`paid`, `revenue_recognition=on_deposit`면 이때 매출 인식 | S0★ |
| QA-PAY-04 | [경계] 일부입금 | `paid_amount < amount` | `partial`, `receivable_amount=amount−paid_amount` 정확 | S0★ |
| QA-PAY-05 | [경계] 미수금 0원 경계 | `paid_amount=amount` | `receivable_amount=0`, 상태 `paid`로 자동 전이 | S1★ |
| QA-PAY-06 | [예외] 과입금 | `paid_amount > amount` | 거부 또는 초과분 별도 처리(음수 미수금 금지) | S0★ |
| QA-PAY-07 | [경계] 할인 적용 | `discount_amount`>0 | `final_amount=list_amount−discount_amount`, 음수 불가 | S1★ |
| QA-PAY-08 | [정상] 금액 정수 저장 | 12,345원 입력 | BIGINT 정수(원), 소수점·float 미발생 | S0★ |
| QA-PAY-09 | [예외] 음수 금액 | `amount<0` 입력 | 거부(환불은 `refunds`로만 처리) | S0★ |
| QA-PAY-10 | [정상] PG 대비 필드 | `payment_provider`/`external_payment_id` | nullable 유지, 온라인 결제(2~3차) 확장 시 채움 | S3 |
| QA-PAY-11 | [정상] 수정 로그 | 결제 금액·상태 수정 | `audit_logs`(action=`update`) before/after 기록 | S0★ |

### 4.1 미수금 검증 쿼리(예시)

```sql
-- (1) receivable_amount 정합 위반 적발
SELECT id, amount, paid_amount, receivable_amount, payment_status
FROM payments
WHERE tenant_id = :tenant_id AND deleted_at IS NULL
  AND receivable_amount <> GREATEST(amount - paid_amount, 0);
-- 기대: 0 rows

-- (2) 상태-금액 불일치 적발 (paid 인데 미수 남음)
SELECT id, payment_status, amount, paid_amount, receivable_amount
FROM payments
WHERE tenant_id = :tenant_id AND payment_status = 'paid'
  AND (paid_amount <> amount OR receivable_amount <> 0);
-- 기대: 0 rows

-- (3) 미수금 합계(대시보드 지표와 대조)
SELECT COALESCE(SUM(receivable_amount), 0) AS total_receivable
FROM payments
WHERE tenant_id = :tenant_id AND payment_status IN ('receivable', 'partial');
```

---

## 5. 환불 모듈 (`refunds`) — 환불·잔여회수 정합 ★

> **환불 산식(원장이 이해할 표현 + 정확 산식)**: 환불액은 "낸 돈에서 이미 쓴 수업값과 위약금을 뺀 금액"이다.
>
> - 사용분 공제 단가 = `refund_unit_basis`에 따라 `list_price`(정가/총횟수) 또는 실판매가(`final_amount`/총횟수).
> - 사용분 금액 = 사용 횟수 × 사용분 공제 단가.
> - 위약금 = `final_amount × refund_penalty_rate`(기본 0.10).
> - **환불액 = `final_amount` − 사용분 금액 − 위약금** (음수면 0).
> - 복구 회수(`restored_count`) = 환불 시점 잔여횟수(미사용분).

| ID | 케이스 | 검증 내용 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-RFD-01 | [정상] 전액 환불(미사용) | 사용 0회, 즉시 환불 | `refund_amount=final_amount−위약금`, `restored_count=total_count` | S0★ |
| QA-RFD-02 | [정상] 부분 환불(일부 사용) | 10회권 중 3회 사용 후 환불 | 사용분 3회 공제 + 위약금 차감, `restored_count=7` | S0★ |
| QA-RFD-03 | [경계] 위약금 0% 스튜디오 | `refund_penalty_rate=0` | 위약금 미공제, 사용분만 공제 | S1★ |
| QA-RFD-04 | [경계] 환불액 음수 방지 | 거의 다 쓴 수강권 환불 | 환불액 음수면 0원, 추가 청구 금지 | S0★ |
| QA-RFD-05 | [정상] `passes` 상태 전이 | 환불 완료 | `pass_status='refunded'`, 이후 예약·차감 불가 | S0★ |
| QA-RFD-06 | [정상] 매출 차감(결제기준) | 환불 완료 | `revenue_records`에 `source_type='refund'`, `amount=−refund_amount` 1건 | S0★ |
| QA-RFD-07 | [예외] 중복 환불 | 같은 payment 2회 환불 | 차단(이미 `refunded`), 멱등 처리 | S0★ |
| QA-RFD-08 | [예외] 환불 초과 | `refund_amount > 결제 실수령액` | 거부 | S0★ |
| QA-RFD-09 | [정상] 환불 로그 | 환불 처리 | `audit_logs`(action=`refund`) before/after·사유 기록 | S0★ |
| QA-RFD-10 | [경계] 환불 취소(requested→canceled) | 요청 후 철회 | `status='canceled'`, 매출 차감 미반영, 잔여 미복구 | S2 |

### 5.1 환불 정합 검증 쿼리(예시)

```sql
-- 환불 1건당 결제기준 매출 음수 레코드가 정확히 1건 존재하는지
SELECT r.id AS refund_id, r.refund_amount,
       COALESCE(SUM(rr.amount), 0) AS recognized_refund
FROM refunds r
LEFT JOIN revenue_records rr
  ON rr.payment_id = r.payment_id
 AND rr.source_type = 'refund' AND rr.revenue_basis = 'payment'
WHERE r.tenant_id = :tenant_id AND r.status = 'completed'
GROUP BY r.id, r.refund_amount
HAVING COALESCE(SUM(rr.amount), 0) <> -r.refund_amount;
-- 기대: 0 rows
```

---

## 6. 매출 이중기준 정합 (`revenue_records`) — 핵심 차별화 검증 ★

> **불변식**: ① 결제기준(`payment`)과 소진기준(`consumption`)은 **별개 합산**이며 한 화면에서 합치지 않는다(중복 합산 금지). ② 1결제 → 결제기준 1건(+환불 음수). ③ 소진 1회 → 소진기준 1건. ④ 소진기준 단가 합(`Σ unit_price_amount`)은 결제 실판매가(`final_amount`)와 ±라운딩 잔차 내 일치.

| ID | 케이스 | 검증 내용 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-REV-01 | [정상] 결제기준 인식 | 결제완료 | `revenue_basis='payment'`, `source_type='payment'`, `amount=paid_amount`, `recognized_at=paid_at` | S0★ |
| QA-REV-02 | [정상] 소진기준 인식 | 1회 차감 시 | `revenue_basis='consumption'`, `source_type='consumption'`, `amount=unit_price_amount`, `class_type`·`instructor_staff_id` 채움 | S0★ |
| QA-REV-03 | [경계] 토글 일치 | 대시보드 결제/소진 토글 | 같은 기간이라도 두 합계가 다를 수 있음(정상). 각 기준 내부 합산만 | S1★ |
| QA-REV-04 | [경계] 소진 합 = 결제액 | 10회 전부 소진 | `Σ consumption.amount ≈ final_amount`(라운딩 잔차 ≤ 회차수 원) | S0★ |
| QA-REV-05 | [정상] 환불 반영(결제기준) | 환불 후 | 결제기준 순매출에서 환불 음수 반영, 소진기준은 미소진분 자동 제외 | S0★ |
| QA-REV-06 | [예외] 이중 적재 금지 | 같은 차감으로 소진 레코드 2건 | 멱등 처리(차감 1건당 1레코드), `pass_transaction_id` 유니크 보장 | S0★ |
| QA-REV-07 | [정상] 신규/재등록 플래그 | `is_new_member`/`is_re_enroll` | 신규회원/재등록 매출 분해 정확(대시보드 ②영역 연동) | S2 |
| QA-REV-08 | [정상] 유입경로/강사 귀속 | `marketing_source`·`instructor_staff_id` | 유입경로별·강사별 수익성 집계 근거 정확 | S2 |

### 6.1 이중기준 검증 쿼리(예시)

```sql
-- (1) 기준별 순매출(절대 섞지 말 것)
SELECT revenue_basis, COALESCE(SUM(amount), 0) AS net_revenue
FROM revenue_records
WHERE tenant_id = :tenant_id
  AND recognized_date BETWEEN :from AND :to
GROUP BY revenue_basis;  -- payment / consumption 각각 1행

-- (2) 소진 합 vs 결제액 대조 (수강권별)
SELECT pa.id AS pass_id, pu.final_amount,
       COALESCE(SUM(rr.amount), 0) AS sum_consumption
FROM passes pa
JOIN purchases pu ON pu.id = pa.purchase_id
LEFT JOIN revenue_records rr
  ON rr.pass_transaction_id IN (
       SELECT id FROM pass_transactions WHERE pass_id = pa.id AND delta < 0
     )
 AND rr.revenue_basis = 'consumption'
WHERE pa.tenant_id = :tenant_id AND pa.pass_status = 'used_up'
GROUP BY pa.id, pu.final_amount
HAVING ABS(pu.final_amount - COALESCE(SUM(rr.amount), 0)) > pa.total_count;
-- 기대: 0 rows (잔차가 회차수(원)를 초과하면 라운딩 버그)

-- (3) 차감당 소진 레코드 중복 적발
SELECT pass_transaction_id, COUNT(*)
FROM revenue_records
WHERE tenant_id = :tenant_id AND source_type = 'consumption'
GROUP BY pass_transaction_id HAVING COUNT(*) > 1;
-- 기대: 0 rows
```

---

## 7. 비용/정산 모듈 (`expense_records`·`expense_categories`·`settlements`)

| ID | 케이스 | 검증 내용 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-EXP-01 | [정상] 수동 비용 입력 | `expense_category`(17종) 선택·`amount`·`vendor_name`·`expense_date` | `source='manual'`, `cost_type` 카테고리 기본값 적용 | S1 |
| QA-EXP-02 | [정상] 카테고리 17종 일치 | 드롭다운 코드 | §3.13 17개 코드와 글자 단위 일치(`rent`~`etc`) | S1 |
| QA-EXP-03 | [경계] 고정/변동 구분 | `cost_type`=fixed/variable | 카테고리 기본값 적용 + 개별 오버라이드 가능, 대시보드 ③ 합계 연동 | S1★ |
| QA-EXP-04 | [정상] 반복비용 | `is_recurring=true`(임대료 등) | 다음 주기 자동 생성 후보(2차), 중복 생성 방지 | S2 |
| QA-EXP-05 | [정상] 강사료 귀속 | `expense_category='instructor_fee'`·`staff_id` | 강사별 비용 귀속, 강사 수익성 산정 연동 | S2 |
| QA-EXP-06 | [정상] 증빙 첨부 | `receipt_file_url`·`doc_memo` | 파일 저장, 권한 있는 역할만 열람 | S2 |
| QA-EXP-07 | [정상] 정산 집계 | `settlements`: `session_count`·`base/bonus/deduction/total_amount` | `total=base+bonus−deduction`, `status`(draft→confirmed→paid) | S1★ |
| QA-EXP-08 | [예외] 음수 비용 | `amount<0` | 거부(환입은 별도 처리) | S2 |

```sql
-- 정산 총액 산식 위반 적발
SELECT id, base_amount, bonus_amount, deduction_amount, total_amount
FROM settlements
WHERE tenant_id = :tenant_id
  AND total_amount <> base_amount + bonus_amount - deduction_amount;
-- 기대: 0 rows
```

---

## 8. 알림 트리거 (`notifications`·`notification_templates`)

> 트리거 13종(§3.20)과 정책(§6.4): `reminder_before_minutes`=1440, `long_absence_days`=21, `low_count_threshold`=2, `expiring_alert_days`=7.

| ID | 케이스 | 트리거 조건 | 기대 결과(`notification_type`) | Sev |
|---|---|---|---|---|
| QA-NTF-01 | [정상] 예약 완료 | 예약 확정 직후 | `reservation_done` 1건 `scheduled→sent` | S2 |
| QA-NTF-02 | [정상] 예약 리마인드 | 시작 1440분(24h) 전 | `reservation_reminder` 1건, 시점 정확 | S2 |
| QA-NTF-03 | [정상] 예약 취소 | 취소 시 | `reservation_canceled` 1건 | S2 |
| QA-NTF-04 | [정상] 대기 확정 | 자동전환 발생 시 | `waitlist_promoted` 1건(§2.4 동시성 연동) | S1 |
| QA-NTF-05 | [경계] 만료 임박 | 만료 7일(`expiring_alert_days`) 전 | `pass_expiring` 1건, 중복 발송 방지 | S2 |
| QA-NTF-06 | [경계] 잔여 부족 | `remaining_count ≤ 2`(`low_count_threshold`) | `pass_low_count` 1건, 임계 도달 시 1회만 | S2 |
| QA-NTF-07 | [경계] 장기 미방문 | 최종 방문 후 21일(`long_absence_days`) | `long_absence` 1건 | S2 |
| QA-NTF-08 | [정상] 체험 전/후 | 체험 예약·완료 시 | `trial_guide`/`trial_followup` | S2 |
| QA-NTF-09 | [정상] 재등록·미수금·리뷰·상담 | 각 조건 | `re_enroll`/`receivable`/`review_request`/`counseling_reminder` | S2 |
| QA-NTF-10 | [예외] 중복/멱등 | 같은 조건 재평가 | 동일 트리거 중복 발송 금지(키 멱등), `status` 정확 | S1 |
| QA-NTF-11 | [예외] 발송 실패 | 채널 오류 | `status='failed'`, `error_message` 기록, 재시도 정책 | S2 |
| QA-NTF-12 | [예외] 수신거부/탈퇴 회원 | opt-out 회원 | 발송 제외, 마케팅성 알림 차단 | S1★ |

---

## 9. 권한/보안 모듈 (RBAC·테넌트 격리·민감정보) ★

> 근거: [`00-canon.md`](./00-canon.md) §5 RBAC 매트릭스, [`13-rbac.md`](./13-rbac.md). 스코프: `all`/`assigned`/`own`. **모든 수정/삭제/환불/수강권 차감은 `audit_logs` 필수.**

### 9.1 역할별 접근 차단(핵심 셀)

| ID | 케이스 | 시나리오 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-SEC-01 | [예외] 강사 전체 매출 접근 | `instructor`가 매출/수익분석 전체 조회 | **차단**, 본인 담당(`assigned`) 매출만 | S0★ |
| QA-SEC-02 | [예외] 강사 통장 잔액 접근 | `instructor`가 통장 잔액 조회 | **불가**(canon §5 "통장 잔액: instructor=불가") | S0★ |
| QA-SEC-03 | [예외] 회원 타인 데이터 | `member`가 타 회원 예약/수강권 조회 | **차단**, `own`만 | S0★ |
| QA-SEC-04 | [예외] info_staff 비용 접근 | `info_staff`가 비용/정산 조회 | **차단**(canon §5 비용/정산 info_staff=–) | S1★ |
| QA-SEC-05 | [정상] accountant 매출·비용 | `accountant`가 매출/비용/수익분석 | 허용(CRUD 비용·매칭, R 매출), 단 회원 CRM은 R만 | S1 |
| QA-SEC-06 | [예외] manager 강사 코멘트 수정 | `manager`가 instructor_comments 수정 | **차단**(manager=R), 강사 본인만 CRUD(assigned) | S2 |
| QA-SEC-07 | [예외] accountant 통장 잔액 vs instructor | 두 역할 비교 | accountant=R 허용, instructor=불가 | S1★ |
| QA-SEC-08 | [정상] 권한 위반 응답코드 | 차단 시 | HTTP 403(권한)·404(격리 은닉) 일관, 정보 누출 없는 메시지 | S1★ |

### 9.2 테넌트/스튜디오 격리 ★

| ID | 케이스 | 시나리오 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-SEC-09 | [예외] 교차 테넌트 조회 | `tenant_A` 사용자가 `tenant_B`의 `member_id` 직접 요청 | **차단/404**, 모든 쿼리 `tenant_id` 필터 강제 | S0★ |
| QA-SEC-10 | [예외] 교차 스튜디오 조회 | 같은 테넌트 내 다른 `studio_id` 데이터 | 역할 스코프대로 격리(owner 외 차단) | S0★ |
| QA-SEC-11 | [예외] IDOR(직접 ID 조작) | URL/바디의 `id`를 타 테넌트 값으로 변조 | 소유권 검증 실패 시 차단, `audit_logs` 의심 기록 | S0★ |
| QA-SEC-12 | [정상] saas_admin 글로벌 | `saas_admin`이 전체 테넌트 조회 | 글로벌 허용(과금/구독 CRUD), 단 업무 데이터는 R | S1 |

### 9.3 민감정보 노출·감사

| ID | 케이스 | 시나리오 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-SEC-13 | [예외] 통장/카드번호 평문 | `account_no_masked`·`card_no_masked` | 항상 마스킹 저장·표시, 평문 노출 0 | S0★ |
| QA-SEC-14 | [예외] 비밀번호/시크릿 | `password_hash`·`credential_ref` | 해시·참조만, API 응답·로그에 평문 0 | S0★ |
| QA-SEC-15 | [정상] 감사로그 필수 | 수정/삭제/환불/수강권 차감/매칭/로그인/내보내기 | `audit_logs` 1건씩(actor·before/after·ip·시각), append-only | S0★ |
| QA-SEC-16 | [예외] 회원 의료정보 | `medical_note`(통증/주의) | 권한 역할만 열람, 강사는 assigned 회원만 | S1★ |
| QA-SEC-17 | [정상] 소프트 삭제 | 금전·감사 데이터 | `deleted_at` 표시만, 물리 삭제 0(`audit_logs`는 미사용) | S0★ |
| QA-SEC-18 | [예외] 내보내기(export) 권한 | 재무 리포트·CSV 내보내기 | 권한 역할(owner/accountant)만, `audit_logs`(action=`export`) | S1★ |

```sql
-- 모든 환불/차감/매칭에 대응 감사로그 존재 여부(누락 적발)
SELECT 'refund' AS kind, r.id
FROM refunds r
LEFT JOIN audit_logs a
  ON a.entity_type = 'refunds' AND a.entity_id = r.id AND a.action = 'refund'
WHERE r.tenant_id = :tenant_id AND r.status = 'completed' AND a.id IS NULL
UNION ALL
SELECT 'pass_adjust', t.id
FROM pass_transactions t
LEFT JOIN audit_logs a
  ON a.entity_type = 'pass_transactions' AND a.entity_id = t.id AND a.action = 'pass_adjust'
WHERE t.tenant_id = :tenant_id AND t.reason IN ('manual_deduct','manual_restore') AND a.id IS NULL;
-- 기대: 0 rows
```

---

## 10. 예약/대기 동시성 (`waitlists`·`reservations`) ★

> 정책: `waitlist_auto_promote`=true, `waitlist_promote_ttl_minutes`=30. 정원 충돌은 **DB 트랜잭션·락(또는 유니크 제약)** 으로 막는다.

| ID | 케이스 | 시나리오 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-CNC-01 | [예외] 마지막 1석 동시 예약 | 정원 1, 회원 2명 동시 클릭 | **정확히 1명만** `booked`, 나머지 `waitlisted` 또는 거부(오버부킹 0) | S0★ |
| QA-CNC-02 | [예외] 개인레슨 동시 예약 | `capacity=1` 회차 2명 동시 | 1명만 확정, 중복 차감 0 | S0★ |
| QA-CNC-03 | [정상] 대기 자동전환 | 결원 발생 | 대기 1순위(`position` 최소) `promoted`, `waitlist_promoted` 알림(§8) | S1★ |
| QA-CNC-04 | [경계] 전환 TTL 만료 | 전환 후 30분 무응답 | 다음 순번으로 이동, 무응답자 `expired` | S1 |
| QA-CNC-05 | [예외] 동시 취소+전환 | 취소와 자동전환 동시 발생 | 정합 유지(이중 전환·결원 누락 0), 락으로 직렬화 | S0★ |
| QA-CNC-06 | [경계] 대기 순번 무결성 | 대기 다수·일부 취소 | `position` 빈틈 재정렬 일관, 동일 회차 중복 대기 금지 | S2 |
| QA-CNC-07 | [예외] 전환 시 잔여 부족 | 대기자의 수강권 잔여 0/만료 | 전환 시점 재검증, 부적격이면 건너뜀 | S1★ |
| QA-CNC-08 | [예외] 더블클릭/재전송 | 같은 예약 요청 2회(네트워크 재시도) | 멱등키로 1건만 생성, 중복 예약·차감 0 | S0★ |

```sql
-- 오버부킹 적발: 확정 예약 수 > 회차 정원
SELECT cs.id AS class_session_id, cs.capacity,
       COUNT(*) FILTER (WHERE r.reservation_status = 'booked') AS booked_count
FROM class_sessions cs
JOIN reservations r ON r.class_session_id = cs.id AND r.deleted_at IS NULL
WHERE cs.tenant_id = :tenant_id
GROUP BY cs.id, cs.capacity
HAVING COUNT(*) FILTER (WHERE r.reservation_status = 'booked') > cs.capacity;
-- 기대: 0 rows
```

---

## 11. CSV 파싱·중복·거래 매칭 (`bank_transactions`·`card_sales`·`card_expenses`·`transaction_matching_rules`) ★

> 근거: [`17-reconciliation-policy.md`](./17-reconciliation-policy.md), [`18-expense-category-policy.md`](./18-expense-category-policy.md). 카드매출 3단계: `approved`→`captured`→`deposited`(§3.21).

### 11.1 CSV 업로드·파싱·중복

| ID | 케이스 | 시나리오 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-CSV-01 | [정상] 통장 CSV 업로드 | 정상 헤더·인코딩 | 전 행 `bank_transactions` 적재, `import_batch_id` 부여 | S1★ |
| QA-CSV-02 | [경계] 인코딩 | EUC-KR/UTF-8/BOM 혼재 | 한글 거래처명 깨짐 0, 자동 감지 또는 명시 선택 | S1 |
| QA-CSV-03 | [경계] 금액 포맷 | `1,234,000`·괄호 음수·공백 | 정수 파싱 정확, 입금+/출금− `direction` 정확 | S0★ |
| QA-CSV-04 | [예외] 깨진 행 | 컬럼 수 불일치·빈 금액 | 해당 행만 격리·오류 리포트, 정상 행은 적재(부분 성공) | S1 |
| QA-CSV-05 | [예외] 중복 업로드 | 같은 파일 2회 | 동일 거래(계좌+일자+금액+잔액+상대명) 중복 적재 0(멱등) | S0★ |
| QA-CSV-06 | [경계] 기간 중복 | 겹치는 기간 파일 | 겹치는 거래만 스킵, 신규만 적재 | S1 |
| QA-CSV-07 | [정상] 카드 사용내역 CSV | `card_expenses` 적재 | `vendor_name`·`used_at`·`amount`·`card_no_masked` 정확 | S1 |
| QA-CSV-08 | [예외] 대용량/타임아웃 | 수천 행 업로드 | 부분 커밋·진행률, 실패 시 배치 롤백 일관 | S2 |

### 11.2 자동 매칭·분류·학습

| ID | 케이스 | 시나리오 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-MCH-01 | [정상] 입금자명↔회원명 매칭 | `depositor_name`≈`members.name`+금액+날짜 | 자동 추천, 확정 시 `payments`↔`bank_transactions` 연결, `awaiting_deposit`→`paid` | S0★ |
| QA-MCH-02 | [경계] 동명이인 | 같은 이름 회원 2명 | 자동확정 보류·후보 다건 제시, 오매칭 방지 | S1★ |
| QA-MCH-03 | [정상] 거래처 규칙 분류 | `transaction_matching_rules`(exact/contains/regex) | `match_target`·`expense_category`·`cost_type` 자동 적용, `priority` 순 | S1 |
| QA-MCH-04 | [정상] 규칙 학습 적용 | 관리자가 분류 수정 | **수정한 규칙이 다음 거래부터 자동 적용**(기존 거래 소급 안 함, 명시 옵션만) | S1★ |
| QA-MCH-05 | [예외] 규칙 충돌 | 여러 규칙 동시 매치 | `priority` 최상위 1건 적용, 비결정성 0 | S2 |
| QA-MCH-06 | [정상] 미매칭 목록 | 매칭 실패 거래 | `is_matched=false` 목록 노출, 수동 분류(revenue/expense/transfer/etc) | S1 |
| QA-MCH-07 | [정상] 이체(내부이동) | `match_target='transfer'` | 매출·비용 집계에서 제외(중복 계상 0) | S0★ |
| QA-MCH-08 | [정상] 매칭 이력 | 모든 매칭/재분류 | `transaction_reconciliation_logs`(action·before/after·rule·staff) 1건 | S1★ |

### 11.3 카드매출 3단계 정산 대조 ★

| ID | 케이스 | 시나리오 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-CRD-01 | [정상] 승인 등록 | 현장 카드결제 | `card_sales` `reconciliation_stage='approved'`, `payment_id` 연결 | S1★ |
| QA-CRD-02 | [정상] 매입 갱신 | 카드사 매입 | `captured`, `captured_at` 기록 | S2 |
| QA-CRD-03 | [정상] 입금 대조 | 통장 입금 매칭 | `deposited`, `bank_transaction_id` 연결, `net_deposit_amount=amount−fee_amount` | S0★ |
| QA-CRD-04 | [경계] 수수료 산정 | `card_fee_rate`=0.023 | `fee_amount` 추정 정확, 실수수료 입금 시 보정 | S1★ |
| QA-CRD-05 | [경계] 미입금 카드매출 | `stage != deposited` 합 | "미입금 카드매출" 지표 = Σ`net_deposit_amount`(미입금분) 정확 | S0★ |
| QA-CRD-06 | [예외] 입금액 불일치 | 통장 입금 ≠ `net_deposit_amount` | 차이 표시·보류, 강제 매칭 차단 | S1★ |

```sql
-- 미입금 카드매출(대시보드 ④ 지표 대조)
SELECT COALESCE(SUM(net_deposit_amount), 0) AS undeposited_card_sales
FROM card_sales
WHERE tenant_id = :tenant_id AND reconciliation_stage <> 'deposited';

-- 동일 통장거래가 매출·비용에 이중 연결되지 않았는지
SELECT bt.id, COUNT(DISTINCT bt.matched_ref_type) AS ref_kinds
FROM bank_transactions bt
WHERE bt.tenant_id = :tenant_id AND bt.is_matched = true
GROUP BY bt.id HAVING COUNT(DISTINCT bt.matched_ref_type) > 1;
-- 기대: 0 rows (한 거래는 단일 대상에만 매칭)
```

---

## 12. 대시보드/지표 정합 (`09-admin-dashboard`·`10-profit-dashboard`·`19-metrics`)

> 근거: [`09-admin-dashboard.md`](./09-admin-dashboard.md), [`10-profit-dashboard.md`](./10-profit-dashboard.md), [`19-metrics.md`](./19-metrics.md). 산식은 canon §4.4.

| ID | 케이스 | 검증 내용 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-DSH-01 | [정상] 순매출 | Σ`revenue_records.amount`(선택 basis, 환불 음수 포함) | 쿼리 합과 화면 일치 | S1★ |
| QA-DSH-02 | [정상] 총비용/고정/변동 | Σ`expense_records.amount`, `cost_type`별 | 고정+변동=총비용, 누락·중복 0 | S1★ |
| QA-DSH-03 | [정상] 영업이익/이익률 | 순매출−총비용 / ÷순매출 | 순매출 0이면 이익률 `–`(0 나눗셈 방지) | S1★ |
| QA-DSH-04 | [정상] 미수금·미입금 카드매출 | §4.4 정의 | §4·§11 쿼리 결과와 일치 | S0★ |
| QA-DSH-05 | [경계] 결제/소진 토글 | 두 기준 전환 | 라벨·합계 정확, 합산 혼용 0 | S1★ |
| QA-DSH-06 | [정상] 4영역 구성 | 오늘운영/매출/비용/수익 | canon·09 문서 지표 누락 0 | S2 |
| QA-DSH-07 | [정상] 권한별 노출 | manager=요약, instructor=assigned 매출만 | RBAC와 일치(§9) | S1★ |
| QA-DSH-08 | [경계] 빈 데이터 | 신규 스튜디오(데이터 0) | 0/`–` 표시, 오류·NaN 0 | S2 |

---

## 13. SaaS/구독·외부연동 (`tenants`·`subscription_plans`·`external_integrations`·`sync_logs`)

| ID | 케이스 | 검증 내용 | 기대 결과 | Sev |
|---|---|---|---|---|
| QA-SAAS-01 | [정상] 구독 상태 전이 | `trial`→`active`→`past_due`→`canceled`/`suspended` | 상태별 기능 제한 반영(`feature_limits_json`) | S2 |
| QA-SAAS-02 | [경계] 사용량 한도 | 알림 발송량·스튜디오 수 초과 | 한도 초과 시 차단/과금, `usage_json` 누적 정확 | S2 |
| QA-SAAS-03 | [예외] 정지 테넌트 접근 | `tenants.status='suspended'` | 로그인·데이터 접근 차단 | S1 |
| QA-SAAS-04 | [정상] 외부연동 상태 | `external_integrations.status`(connected/error) | 연동 실패 시 `sync_logs`(failed)·`error_message` 기록 | S2 |
| QA-SAAS-05 | [예외] 동기화 부분 실패 | `sync_logs.status='partial'` | 성공분 반영·실패분 재시도, 중복 적재 0 | S2 |

---

## 14. 데이터 정합성 종합 검증 쿼리 모음(릴리스 게이트)

> 아래 쿼리는 **모든 0 rows를 만족해야 출시**한다. CI/스테이징에서 테넌트별 실행.

| # | 검증 | 위치 |
|---|---|---|
| V1 | 수강권 잔여 = 총횟수 + 거래합 | §3.3 (1) |
| V2 | 음수 잔여 없음 | §3.3 (2) |
| V3 | `balance_after` 연속성 | §3.3 (3) |
| V4 | `receivable_amount` 정합 | §4.1 (1) |
| V5 | 결제 상태-금액 일관성 | §4.1 (2) |
| V6 | 환불 ↔ 결제기준 음수매출 1:1 | §5.1 |
| V7 | 소진 합 = 결제액(라운딩 내) | §6.1 (2) |
| V8 | 차감당 소진 레코드 중복 없음 | §6.1 (3) |
| V9 | 정산 총액 산식 | §7 |
| V10 | 환불/차감 감사로그 누락 없음 | §9.3 |
| V11 | 오버부킹 없음 | §10 |
| V12 | 통장거래 단일 대상 매칭 | §11.3 |
| V13 | 미입금 카드매출 = 대시보드 지표 | §11.3 / §12 |

```sql
-- V-합계: 기준별 매출·비용·이익 한눈 대조(대시보드와 1:1 비교용)
WITH rev AS (
  SELECT revenue_basis, SUM(amount) AS net_revenue
  FROM revenue_records
  WHERE tenant_id = :tenant_id AND recognized_date BETWEEN :from AND :to
  GROUP BY revenue_basis
), exp AS (
  SELECT cost_type, SUM(amount) AS cost_sum
  FROM expense_records
  WHERE tenant_id = :tenant_id AND expense_date BETWEEN :from AND :to
  GROUP BY cost_type
)
SELECT
  (SELECT net_revenue FROM rev WHERE revenue_basis = 'payment')      AS rev_payment,
  (SELECT net_revenue FROM rev WHERE revenue_basis = 'consumption')  AS rev_consumption,
  (SELECT COALESCE(SUM(cost_sum),0) FROM exp)                        AS total_cost,
  (SELECT COALESCE(cost_sum,0) FROM exp WHERE cost_type = 'fixed')   AS fixed_cost,
  (SELECT COALESCE(cost_sum,0) FROM exp WHERE cost_type = 'variable')AS variable_cost;
```

---

## 15. 회귀 시나리오(엔드투엔드)

> 핵심 금전 흐름을 처음부터 끝까지 재현해 **상태·금액·매출·감사**가 일관되는지 본다.

### RS-1: 결제→예약→출석→소진 (정상 흐름)

1. 회원 등록(`new_inquiry`) → 상담 → `enrolled`.
2. 10회권 결제 50만원(`card_onsite`) → `payments.paid`, `card_sales.approved`, **결제기준 매출 +500,000**.
3. 회차 예약(`booked`) → 출석(`attended`) → `deduct_attend`(`delta=-1`), `remaining_count=9`, **소진기준 매출 +50,000**.
4. 검증: 결제기준 합 500,000 / 소진기준 합 50,000(1회분) / 감사로그(차감) 1건 / 잔여 정합(V1).

### RS-2: 무통장입금 미수→입금 매칭 (대조 흐름)

1. 계좌이체 결제 등록 → `awaiting_deposit`, 매출 미인식(`on_deposit` 정책).
2. 통장 CSV 업로드 → 입금자명·금액·날짜 자동 매칭 → 확정.
3. `awaiting_deposit`→`paid`, **결제기준 매출 인식**, `receivable_amount=0`.
4. 검증: V4·V5·V13, 동일 거래 중복 적재 0(QA-CSV-05).

### RS-3: 부분 사용 후 환불 (환불 정합)

1. 10회권 50만원, 3회 사용(소진기준 매출 +150,000).
2. 환불: 사용분 3회 공제 + 위약금 10% → `refund_amount` 계산, `restored_count=7`.
3. `pass_status='refunded'`, **결제기준 매출에 −refund_amount**, 소진기준은 3회분 유지.
4. 검증: V6, QA-RFD-04(음수 방지), 감사로그(refund) 1건.

### RS-4: 정원 1석 동시 예약 (동시성)

1. 정원 1 회차, 회원 2명 동시 예약 요청.
2. 정확히 1명 `booked`, 1명 `waitlisted`. 결원 발생 시 대기 자동전환·알림.
3. 검증: V11(오버부킹 0), 중복 차감 0, `waitlist_promoted` 1건.

### RS-5: 권한 격리 (보안)

1. `instructor` 로그인 → 전체 매출/통장 잔액 요청 → **차단**.
2. `tenant_A` 사용자 → `tenant_B` 회원 id 요청 → **404/차단**.
3. 검증: QA-SEC-01·02·09, 차단 로그·정보 누출 0.

---

## 16. 수용기준(05-scope-mvp) 연결 매트릭스

> [`05-scope-mvp.md`](./05-scope-mvp.md)의 MVP 기능별 수용기준(AC)을 본 체크리스트로 검증한다. MVP 게이트는 아래 매핑의 **S0/S1 전부 PASS**.

| MVP 기능(05) | 수용기준 요지 | 검증 체크 ID |
|---|---|---|
| 회원/상담 관리 | 등록·상태전이·전환율 산정 정확 | QA-MEM-01~08, QA-CRM-01~05 |
| 1:1/그룹 수업·모바일 예약 | 30초 예약, 정책 경계 정확 | QA-CLS-01~05, QA-RSV-01~08 |
| 예약/취소/대기 | 취소마감·노쇼·대기전환 정확 | QA-RSV-09~14, QA-CNC-01~08 |
| 출석/결석/노쇼 | 출석 멱등·차감 정확 | QA-RSV-11~14, QA-PASS-01~06 |
| 횟수권/잔여/만료 | 잔여 정합·만료·정지 | QA-PASS-01~12, V1~V3 |
| 현장카드/계좌이체 기록·미수금 | 상태-금액 일관·미수 정확 | QA-PAY-01~11, V4~V5 |
| 환불 | 환불 산식·잔여회수·매출차감 | QA-RFD-01~10, V6 |
| 매출 이중기준 | 결제/소진 분리·라운딩 | QA-REV-01~08, V7~V8 |
| 비용 수동입력 | 17종 카테고리·고정/변동 | QA-EXP-01~08, V9 |
| 통장/카드 CSV 업로드 | 파싱·중복·매칭 | QA-CSV-01~08, QA-MCH-01~08 |
| 기본 매출/비용/손익 대시보드 | 지표 정합·토글 | QA-DSH-01~08, V13 |
| 역할별 권한·수정/삭제 로그 | RBAC 차단·격리·감사 | QA-SEC-01~18, V10 |

> **출시 판정 규칙**: 위 표의 모든 ★(S0)·S1 항목 PASS + §14 V1~V13 전부 0 rows + RS-1~RS-5 통과 시 MVP 릴리스 승인.

---

## 관련 문서

- [`00-canon.md`](./00-canon.md) — 단일 진실원천(스키마·enum·RBAC·회계모델·정책 기본값)
- [`05-scope-mvp.md`](./05-scope-mvp.md) — MVP 범위·수용기준(본 문서 §16 연결)
- [`13-rbac.md`](./13-rbac.md) — 권한 정책 상세(§9 근거)
- [`14-booking-policy.md`](./14-booking-policy.md) — 예약/취소/노쇼/차감 정책(§2·§3·§10 근거)
- [`15-pass-policy.md`](./15-pass-policy.md) — 수강권 정책(§3 근거)
- [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) — 결제/환불 정책(§4·§5 근거)
- [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) — 거래 매칭 정책(§11 근거)
- [`18-expense-category-policy.md`](./18-expense-category-policy.md) — 비용 카테고리 정책(§7·§11 근거)
- [`19-metrics.md`](./19-metrics.md) — 수익분석 지표 정의(§6·§12 근거)
- [`09-admin-dashboard.md`](./09-admin-dashboard.md) · [`10-profit-dashboard.md`](./10-profit-dashboard.md) — 대시보드 설계(§12 근거)
- [`23-risks.md`](./23-risks.md) — 운영 리스크와 대응(본 QA 실패 시 대응 연결)
