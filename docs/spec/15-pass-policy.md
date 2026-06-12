# 15-pass-policy.md — 수강권 정책

> **목적**: 횟수권 중심의 수강권(상품·인스턴스) 운영 규칙을 한 곳에 확정한다 — 권종별 속성, 발급·시작·만료, 홀딩(일시정지)/재개, 만료 연장, 환불 계산, 차감·복구 원장(`pass_transactions`), 만료임박/잔여부족 알림 트리거. 차감 동작은 [`14-booking-policy.md`](./14-booking-policy.md)와 정합하며, 모든 enum·테이블·컬럼·정책 기본값은 [`00-canon.md`](./00-canon.md)를 글자 단위로 따른다.

본 문서가 1차로 소유하는 범위: `pass_kind`(§3.7) · `pass_status`(§3.8) · `pass_txn_reason`(§3.9) · 수강권 정책 파라미터(00-canon §6.2). 관련 테이블: `products` · `passes` · `pass_transactions` · `purchases` · `refunds` · `revenue_records`.

---

## 0. 원장(비전문가)을 위한 한 줄 요약

> **수강권은 "회원이 미리 사둔 수업 횟수의 지갑"이다.** 지갑에 횟수를 채우는 일(발급), 한 번씩 빼 쓰는 일(차감), 잘못 빠진 걸 되돌리는 일(복구), 잠시 멈췄다 다시 쓰는 일(홀딩/재개), 그만두고 남은 횟수를 돈으로 돌려주는 일(환불) — 이 다섯 가지가 전부다. 모든 횟수 변동은 한 줄도 빠짐없이 `pass_transactions`(수강권 증감 원장)에 적힌다.

회계 관점에서 수강권은 두 얼굴을 가진다. 결제하는 순간 **현금(결제기준 매출)** 이 들어오지만, 그 돈은 아직 "수업을 해주기로 한 빚(선수금)"이다. 회원이 수업을 한 번 들을 때마다 그 빚이 단가만큼 **진짜 번 돈(소진기준 매출)** 으로 바뀐다. 이 솔루션은 두 관점을 동시에 기록한다(00-canon §4 이중 손익 모델).

---

## 1. 상품과 인스턴스: `products` vs `passes`

수강권은 **두 단계**로 존재한다. 헷갈리지 않도록 구분한다.

| 구분 | 테이블 | 의미 | 예시 |
|---|---|---|---|
| 상품 정의 | `products` | 판매 카탈로그 1줄. "어떤 권종을, 몇 회, 며칠짜리로, 얼마에 파는가"의 **설계도** | "1:1 10회권 / 90일 / 1,200,000원" |
| 수강권 인스턴스 | `passes` | 특정 회원이 **실제로 보유한** 수강권 1장. 잔여·만료·정지 상태를 가진 **실물 지갑** | "홍길동의 1:1 10회권(잔여 7회, 만료 2026-09-10)" |

발급 경로: 회원이 `products`를 구매하면 `purchases`(구매 주문) 1건이 생기고, 그 결과로 `passes` 1장이 발급된다(`purchases.pass_id`로 연결). **1구매 = 1수강권 발급이 기본**이다(00-canon §2-E.20).

```
products(설계도) ──구매──▶ purchases(주문) ──발급──▶ passes(회원의 지갑)
                                                          │
                                       매 수업 차감/복구 ─┴─▶ pass_transactions(증감 원장)
```

### 1.1 `products` 핵심 컬럼 (00-canon §2-D.17)

| 컬럼 | 의미 | 비고 |
|---|---|---|
| `pass_kind` ◆ | 권종(§3.7) | `personal`/`group`/`trial`/`package` |
| `total_count` | 총 제공 횟수 | 정수. NULL=무제한(횟수권에서는 비사용) |
| `valid_days` | 유효기간(일) | 시작일로부터 며칠간 유효 |
| `price_amount` ★ | 정가(원) | 정수, KRW |
| `allowed_class_types` | 사용 가능 수업 유형 | json: `["personal"]`, `["group"]`, `["personal","group"]`, `["trial"]` |
| `holdable` ◆ | 정지 가능 여부 | true/false |
| `max_hold_days` | 최대 정지일 | 누적 정지 한도 |

### 1.2 `passes` 핵심 컬럼 (00-canon §2-D.18)

| 컬럼 | 의미 | 비고 |
|---|---|---|
| `product_id` → `products` | 발급 근거 상품 | |
| `purchase_id` → `purchases` | 발급 근거 구매 | |
| `pass_kind` ◆ | 권종(§3.7) | 상품에서 복사(발급 시점 고정) |
| `total_count` | 총횟수(발급 시 확정) | 상품 `total_count` 복사 |
| `remaining_count` | **잔여횟수**(현재 지갑 잔액) | `pass_transactions` 합산과 항상 일치 |
| `start_date` | 시작일(KST date) | §2 시작일 규칙 |
| `expire_date` | 만료일(KST date) | `start_date + valid_days`(+ 홀딩 연장) |
| `pass_status` ◆ | 상태(§3.8) | `active`/`paused`/`expired`/`refunded`/`used_up` |
| `paused_at` | 현재 정지 시작 시각 | 정지 중에만 값 존재 |
| `paused_days_used` | 누적 사용 정지일 | `max_hold_days`와 비교 |
| `unit_price_amount` ★ | **소진기준 단가**(원) | `round(final_amount / total_count)`, 발급 시 고정(00-canon §4.2) |

> **불변식(invariant) #1**: `passes.remaining_count == passes.total_count + Σ(pass_transactions.delta)` 가 항상 성립해야 한다. 차감은 음수 delta, 복구는 양수 delta. 잔여는 절대 직접 UPDATE하지 않고 **반드시 `pass_transactions` 레코드를 통해서만** 바뀐다. (검증 항목은 [`22-qa-checklist.md`](./22-qa-checklist.md))

---

## 2. 권종별 속성 매트릭스 (1:1권 / 그룹권 / 체험권 / 패키지권 / 기간제한 횟수권)

원본 요구사항 §4(수강권/상품 관리)의 모든 권종을 다룬다. **횟수권 중심**이므로 모든 권종은 `total_count`를 가진다.

| 속성 | 1:1권 (`personal`) | 그룹권 (`group`) | 체험권 (`trial`) | 패키지권 (`package`) |
|---|---|---|---|---|
| `pass_kind` | `personal` | `group` | `trial` | `package` |
| `allowed_class_types`(사용 가능 수업) | `["personal"]` | `["group"]` | `["trial"]` | `["personal","group"]` |
| 대표 `total_count` | 10·20·30회 | 10·20회 | 1·2회 | 혼합(예: 1:1 4 + 그룹 8) |
| 대표 `valid_days`(유효기간) | 60·90·120일 | 60·90일 | 7·14일 | 90·120일 |
| 단가(`unit_price_amount`) | 높음(개인) | 낮음(그룹) | 무료/저가 | 권종 혼합 → §2.4 별도 |
| `holdable`(정지 가능) | true(기본) | true(기본) | **false** | true |
| `max_hold_days` | 30일(기본) | 30일(기본) | 0 | 30~60일 |
| 환불 대상 | O | O | 원칙 X(무료/체험) | O |
| 차감 시점 | 스튜디오 `deduct_timing` | 스튜디오 `deduct_timing` | 스튜디오 `deduct_timing` | 스튜디오 `deduct_timing` |
| 비고 | 만료임박/잔여부족 알림 대상 | 동일 | 전환(상담CRM) 대상 | 사용처 매칭 §2.4 주의 |

> **"기간제한 횟수권"** 은 별도 enum 값이 아니라, **모든 횟수권이 `valid_days`(유효기간)를 가진다는 속성**으로 표현된다. 즉 1:1권·그룹권·패키지권 모두 기간제한 횟수권이다. 기간 무제한이 필요하면 `valid_days`를 매우 길게(예: 3650일) 설정하되, 횟수는 항상 존재한다.

### 2.1 1:1권 (`personal`)
- 개인레슨(`class_type=personal`) 회차만 예약·차감 가능. 그룹 회차 예약 시도 시 거부(§3.1 사용처 검증).
- 단가가 높아 환불·홀딩 분쟁 가능성이 큼 → 모든 변동은 `pass_transactions`·`audit_logs` 이중 기록.

### 2.2 그룹권 (`group`)
- 그룹레슨(`class_type=group`) 회차만 예약·차감 가능.
- 정원(`class_sessions.capacity`) 초과 시 대기(`waitlists`)로 전환 → 차감/복구는 [`14-booking-policy.md`](./14-booking-policy.md) 규칙을 따른다.

### 2.3 체험권 (`trial`)
- 체험수업(`class_type=trial`) 1~2회용. 통상 무료 또는 저가, **정지 불가**(`holdable=false`, `max_hold_days=0`).
- 환불 원칙 비대상(무료이거나 전환 유도용). 유료 체험은 §5 환불 규칙 준용.
- 체험 종료 후 정규 등록 전환은 상담CRM(`leads`/`member_status`) 흐름으로 이어진다(원본 §10).

### 2.4 패키지권 (`package`) — 혼합 사용처 주의
- `allowed_class_types`에 둘 이상(예: `["personal","group"]`)을 담는다. 한 장의 지갑에서 1:1과 그룹을 모두 쓸 수 있다.
- **소진기준 매출의 단가 정확성 문제**: 패키지는 1:1과 그룹 단가가 다른데 `passes.unit_price_amount`는 단일 값이다. 운영상 두 가지 방식 중 하나를 택한다.
  - **(권장) 분리 발급**: 패키지 구매 1건에서 1:1분 `passes` 1장 + 그룹분 `passes` 1장을 각각 발급(각자 `unit_price_amount` 정확). `purchases` 1건이 `passes` 2장과 연결되는 예외 케이스로 운영. 소진기준 수익성(강사별·수업유형별)이 정확해진다.
  - **(단순) 가중 평균 단가**: 한 장으로 발급하되 `unit_price_amount = round(final_amount / total_count)`(혼합 평균). 구현은 단순하나 수업유형별 수익성이 평균값으로 뭉개진다.
- 본 정책의 **기본값은 (권장) 분리 발급**이다. 소진기준 분석 정확성을 우선한다.

---

## 3. 시작일 · 만료일 산정

### 3.1 시작일(`start_date`) 결정 규칙
발급 시 `start_date`는 아래 우선순위로 정한다(KST 기준 날짜).

1. **수동 지정**: 직원이 특정 시작일을 입력하면 그 값.
2. **즉시 시작**: 미지정 시 기본은 구매일(`purchases.purchased_at`의 KST date).
3. **첫 사용일 시작(옵션)**: 스튜디오 설정으로 "첫 예약/출석일에 자동 개시"를 켜면, 발급 시 `start_date=NULL`로 두고 첫 차감 발생 시점에 그날로 확정. (선결제 후 오픈 대기 회원 배려)

### 3.2 만료일(`expire_date`) 기본 산식

```
expire_date = start_date + (valid_days - 1)일
```

> `valid_days`는 "유효 일수"이므로 시작일 당일을 1일째로 센다. 예: `start_date=2026-06-12`, `valid_days=90` → `expire_date=2026-09-09`. (90일째 되는 날까지 사용 가능, 반열림 아님 — 날짜는 만료일 23:59(KST)까지 유효)

홀딩으로 인한 연장은 §4.4에서 `expire_date`에 가산한다.

### 3.3 만료 판정
- 매일 1회(스튜디오 타임존 자정 배치) `expire_date < today(KST)` 이고 `pass_status='active'` 인 수강권을 `expired`로 전이.
- 단, `remaining_count == 0` 이면 만료 전이라도 `used_up`(소진완료)으로 전이(§6 상태 전이).
- 만료된 수강권으로는 예약 불가. 만료 연장(§4.5)으로만 되살릴 수 있다.

---

## 4. 홀딩(일시정지) · 재개 · 만료 연장

홀딩은 "지갑을 잠시 얼려두고, 얼린 기간만큼 유효기간을 뒤로 미는" 기능이다. 부상·출장·임신 등으로 회원이 당분간 못 나올 때 사용한다.

### 4.1 홀딩 가능 조건 (모두 충족)
1. `passes.holdable = true` (상품에서 상속, 체험권은 보통 false).
2. 스튜디오 정책 `holdable = true` (00-canon §6.2 기본값 true).
3. `pass_status = 'active'` (이미 만료·환불·소진된 권은 정지 불가).
4. `paused_days_used + 신청 정지일수 ≤ max_hold_days` (누적 한도, 기본 30일).
5. 잔여횟수 `remaining_count > 0` (남은 횟수가 있어야 의미 있음).

### 4.2 홀딩 시작
- `pass_status` → `paused`, `paused_at = now()` 기록.
- 정지 중에는 **예약 불가**(예약 시도 시 [`14-booking-policy.md`] 규칙으로 거부). 만료 판정도 일시 보류한다(정지 일수는 만료 카운트에서 제외).
- 홀딩은 횟수 변동이 아니므로 `pass_transactions`에는 기록하지 않는다. 대신 `audit_logs`(`action=update`, before/after)에 반드시 남긴다(원본 §14: 수강권 변경 기록).

### 4.3 재개(정지 해제)
- `pass_status` → `active`.
- **이번 정지 기간** = `재개일(KST) − paused_at의 KST date`(일 단위).
- `paused_days_used += 이번 정지 기간`, `paused_at = NULL`.
- 만료일 연장 적용(§4.4).

### 4.4 홀딩에 의한 만료 연장 산식

```
연장일수 = min(이번 정지 기간, 남은 정지 한도)
남은 정지 한도 = max_hold_days - (재개 전 paused_days_used)
new_expire_date = 기존 expire_date + 연장일수
```

> 정지한 일수만큼 그대로 만료일을 뒤로 민다. 단, 누적 정지일이 `max_hold_days`를 넘는 부분은 연장에 반영하지 않는다(한도 보호).

**예시 (max_hold_days=30):**

| 항목 | 값 |
|---|---|
| 발급 시 `start_date` | 2026-06-12 |
| `valid_days` | 90 |
| 최초 `expire_date` | 2026-09-09 |
| 1차 정지 | 2026-07-01 시작 → 2026-07-15 재개 (14일) |
| `paused_days_used` 갱신 | 0 → 14 |
| 연장일수 | min(14, 30−0)=14 |
| 갱신 `expire_date` | 2026-09-09 + 14일 = 2026-09-23 |
| 2차 정지 | 2026-08-01 시작 → 2026-08-25 재개 (24일) |
| 남은 정지 한도 | 30 − 14 = 16 |
| 연장일수 | min(24, 16)=16 (8일은 한도 초과로 미반영) |
| `paused_days_used` 갱신 | 14 → 30 (한도 도달) |
| 최종 `expire_date` | 2026-09-23 + 16일 = 2026-10-09 |

이후 추가 정지는 §4.1 조건 4 위반(한도 소진)으로 거부된다.

### 4.5 만료 연장(수동) — 홀딩과 별개
- 스튜디오 정책 `extend_allowed = true`(00-canon §6.2 기본 true)일 때, 오너/관리자가 사유와 함께 `expire_date`를 직접 늘릴 수 있다(보상·서비스 차원).
- `expired` 상태의 권도 연장으로 `active` 복귀 가능(`expire_date ≥ today`가 되면).
- 횟수 변동이 아니므로 `pass_transactions` 미기록, `audit_logs`(`action=update`) 필수. 사유는 `memo`성 필드/감사로그에 남긴다.

---

## 5. 환불 계산 규칙 (사용분 차감 · 위약 · 잔여 환산)

환불은 "남은 횟수를 돈으로 돌려주되, 이미 쓴 수업은 제값을 받고, 약속을 깬 데 대한 위약금을 떼는" 계산이다. 결제·환불 자체의 상태(`refunds`, `payment_status`)는 [`16-payment-refund-policy.md`](./16-payment-refund-policy.md)가 소유하고, **본 문서는 수강권 관점의 잔여 환산·횟수 회수**를 정의한다.

### 5.1 핵심 산식 (정수 원 단위, 라운딩은 round)

원본 §4 "환불 계산"과 00-canon §6.3 파라미터(`refund_penalty_rate`=0.10, `refund_unit_basis`=`list_price`)를 사용한다.

```
사용 횟수(used)         = total_count - remaining_count
공제 단가(deduct_unit)  = (refund_unit_basis == 'list_price')
                            ? round(list_amount / total_count)        # 정가 기준(통상 더 높음)
                            : round(final_amount / total_count)       # 실판매가 기준(= unit_price_amount)
사용분 공제액           = deduct_unit × used
환불 기준액             = final_amount - 사용분 공제액
위약 공제액             = round(환불 기준액 × refund_penalty_rate)
refund_amount(환불액)   = max(0, 환불 기준액 - 위약 공제액)
restored_count(회수)    = remaining_count       # 남은 횟수는 전부 회수(0으로)
```

> **원장 설명**: ① 회원이 낸 돈(`final_amount`)에서 ② 이미 들은 수업을 **정가 단가로** 계산해 빼고(할인받아 샀어도 사용분은 정가로 정산하는 게 업계 통례 → `list_price` 기본) ③ 남은 금액에서 위약금 10%를 떼면 ④ 돌려줄 돈이 나온다. ⑤ 남아 있던 횟수는 전부 회수해 지갑을 0으로 만든다.

### 5.2 환불 계산 예시

**전제**: 1:1 10회권. `list_amount`(정가) 1,300,000원, `discount_amount` 100,000원, `final_amount`(실판매) 1,200,000원. `total_count`=10, 현재 `remaining_count`=6(4회 사용). `refund_penalty_rate`=0.10, `refund_unit_basis`=`list_price`.

| 단계 | 계산 | 결과 |
|---|---|---|
| 사용 횟수 used | 10 − 6 | 4회 |
| 공제 단가(정가) | round(1,300,000 / 10) | 130,000원 |
| 사용분 공제액 | 130,000 × 4 | 520,000원 |
| 환불 기준액 | 1,200,000 − 520,000 | 680,000원 |
| 위약 공제액 | round(680,000 × 0.10) | 68,000원 |
| **환불액 refund_amount** | 680,000 − 68,000 | **612,000원** |
| 회수 횟수 restored_count | remaining_count | 6회 |

**대조 — `refund_unit_basis`=`final_price`일 때** (실판매가 단가로 사용분 공제):

| 단계 | 계산 | 결과 |
|---|---|---|
| 공제 단가(실판매) | round(1,200,000 / 10) = unit_price_amount | 120,000원 |
| 사용분 공제액 | 120,000 × 4 | 480,000원 |
| 환불 기준액 | 1,200,000 − 480,000 | 720,000원 |
| 위약 공제액 | round(720,000 × 0.10) | 72,000원 |
| **환불액** | 720,000 − 72,000 | **648,000원** |

> 정가 기준이 회원에게 불리하다(공제 단가가 높음). 스튜디오가 약관으로 명시한 기준을 `refund_unit_basis`로 설정한다.

### 5.3 환불이 수강권·매출에 미치는 영향 (결제기준 vs 소진기준)

환불은 **두 매출 기준에 서로 다르게** 반영된다. 이 구분이 본 솔루션의 핵심이다(00-canon §4).

| 구분 | 처리 내용 | `revenue_records` |
|---|---|---|
| **결제기준** (`payment`) | 결제 전액이 이미 매출로 인식돼 있었으므로, 환불액만큼 **빼야** 한다. | `revenue_basis='payment'`, `source_type='refund'`, `amount = -refund_amount`(음수) 1건 추가(00-canon §4.1) |
| **소진기준** (`consumption`) | 이미 들은 4회분은 소진 시점에 이미 매출로 잡혀 **그대로 둔다**. 남은 6회는 애초에 소진 인식되지 않았으므로 **자동으로 매출에 없다** → 별도 차감 불필요. | 추가 레코드 없음(미소진=미인식, 00-canon §4.2) |

> **원장 비교**: 결제기준 장부에서는 "환불 −612,000원"이 찍혀 순매출이 줄어든다. 소진기준 장부에서는 "회원이 실제로 들은 4회 × 단가"만 매출로 남고, 환불은 장부를 흔들지 않는다. **그래서 소진기준이 수익성·강사료 분석에 정확하다.**

### 5.4 수강권 상태·잔여 처리
- 환불 확정 시: `passes.pass_status` → `refunded`, 잔여 회수를 위해 `pass_transactions`에 **수동복구가 아닌 회수 차감**을 기록한다.
  - 회수는 `reason='manual_deduct'`, `delta = -remaining_count`, `balance_after = 0`, `memo='환불 회수'`, `refunds.id` 참조를 `memo`/감사로그에 남긴다.
  - 회수 후 `passes.remaining_count = 0` (불변식 #1 유지).
- `refunds.restored_count`에는 회수한 횟수(=환불 직전 `remaining_count`)를 기록한다.
- 이미 소진(차감)된 분에 대한 소급 환불이 필요하면 [`16-payment-refund-policy.md`]의 예외 절차를 따른다(통상 비대상, 00-canon §4.2).
- 부분 환불(횟수 일부만 환불) 정책을 쓰는 스튜디오는 `restored_count`를 부분값으로, 잔여를 그만큼만 회수한다.

---

## 6. 수강권 상태(`pass_status`)와 전이

### 6.1 상태 정의 (00-canon §3.8 — 글자 단위 일치)

| 코드 | 라벨 | 진입 조건 |
|---|---|---|
| `active` | 사용중 | 발급 직후(정상). 예약·차감 가능 |
| `paused` | 정지(홀딩) | 홀딩 신청(§4) |
| `expired` | 만료 | `expire_date < today` 이고 잔여>0 |
| `refunded` | 환불 | 환불 확정(§5) |
| `used_up` | 소진완료 | `remaining_count == 0` 도달 |

### 6.2 상태 전이도

```
            발급
             │
             ▼
         [ active ] ──홀딩──▶ [ paused ] ──재개──▶ [ active ]
          │  │  │
   잔여=0 │  │  └── expire_date 경과(잔여>0) ──▶ [ expired ] ──만료연장(§4.5)──▶ [ active ]
          │  └── 환불 확정 ─────────────────────▶ [ refunded ]  (종료)
          ▼
       [ used_up ]  (종료; 잔여 0)
                  └── 환불(이론상 잔여0이라 환불액 0 가능) ─▶ [ refunded ]
```

전이 규칙:
- `paused` 상태에서는 만료 카운트가 멈춘다(§4.2). 재개 시 만료일이 연장된다(§4.4).
- `expired`는 `extend_allowed=true`이고 연장으로 `expire_date ≥ today`가 되면 `active` 복귀 가능(§4.5).
- `refunded`는 종료 상태(되돌리지 않음). 오기입은 환불 취소(`refunds.status='canceled'`)로 처리하고 감사로그에 남긴다.
- 모든 전이는 `updated_at` 갱신 + 금전·횟수 관련이면 `audit_logs` 필수.

---

## 7. 차감/복구 원장 `pass_transactions` — 사유 코드와 적용

모든 횟수 변동은 `pass_transactions`에 **append-only(불변)** 로 1건씩 쌓인다(00-canon §2-D.19). 잔여는 이 원장의 누적으로만 바뀐다(불변식 #1).

### 7.1 사유 코드 `pass_txn_reason` (00-canon §3.9 — 글자 단위 일치)

| 코드 | 라벨 | delta 방향 | 발생 시점 | 연결 |
|---|---|---|---|---|
| `deduct_booking` | 예약차감 | − | 예약 확정 시(정책 `deduct_timing=on_booking`) | `reservation_id` |
| `deduct_attend` | 출석차감 | − | 출석 처리 시(정책 `deduct_timing=on_attend`) | `attendance_id`(+`reservation_id`) |
| `restore_cancel` | 취소복구 | + | 무차감 취소·정책상 복구 취소 시 | `reservation_id` |
| `restore_close` | 폐강복구 | + | 수업 폐강(`session_status=canceled`) 시 | `reservation_id` |
| `manual_deduct` | 수동차감 | − | 직원 수동 차감(보정·환불 회수 등) | `created_by` |
| `manual_restore` | 수동복구 | + | 직원 수동 복구(오차감 정정 등) | `created_by` |

> **차감 시점은 둘 중 하나만 사용**한다. 스튜디오 `deduct_timing`(00-canon §6.1 기본 `on_attend`)이 `on_booking`이면 `deduct_booking`을, `on_attend`이면 `deduct_attend`만 발생한다. 이 규칙은 [`14-booking-policy.md`](./14-booking-policy.md)와 정합한다(노쇼/지각취소 차감 동작도 동일 문서 소유).

### 7.2 `pass_transactions` 레코드 필드 (00-canon §2-D.19)

| 컬럼 | 의미 |
|---|---|
| `pass_id` → `passes` | 대상 수강권 |
| `member_id` → `members` | 회원 |
| `reason` ◆ | §7.1 사유 코드 |
| `delta` | 증감(음수=차감, 양수=복구) |
| `balance_after` | **처리 직후 잔여**(= 직전 잔여 + delta) |
| `reservation_id` → `reservations` (nullable) | 예약/출석 연계 시 |
| `attendance_id` → `attendance` (nullable) | 출석차감 연계 시 |
| `memo` | 수동 조정 사유 등 |
| `created_by` | 수동 조정 주체(시스템 자동 시 NULL) |

### 7.3 잔여 변동 예시 (1:1 10회권, `deduct_timing=on_attend`)

| # | 사유 `reason` | delta | balance_after | 비고 |
|---|---|---|---|---|
| — | (발급) | — | 10 | `total_count`=10, `remaining_count`=10 |
| 1 | `deduct_attend` | −1 | 9 | 1회차 출석 |
| 2 | `deduct_attend` | −1 | 8 | 2회차 출석 |
| 3 | `deduct_attend` | −1 | 7 | 3회차 출석(노쇼는 14-booking 정책에 따라 `no_show_deduct`면 동일하게 −1) |
| 4 | `manual_restore` | +1 | 8 | 3회차가 강사 사정 결강 → 수동 복구, `memo='강사 사정 결강 보정'` |
| 5 | `deduct_attend` | −1 | 7 | 재수강 출석 |
| … | … | … | … | |
| N | `manual_deduct` | −7 | 0 | **환불 회수**(§5.4), `memo='환불 회수'` → 이후 `pass_status=refunded` |

> `balance_after`는 매 행에서 직전 잔여에 delta를 더한 값이며, 마지막 행의 `balance_after`는 항상 `passes.remaining_count`와 같아야 한다(불변식 #1).

### 7.4 소진기준 매출과의 연동
- `delta < 0`(차감) 이고 `reason ∈ {deduct_booking, deduct_attend}` 인 레코드는 **소진기준 매출** 1건을 만든다: `revenue_records(revenue_basis='consumption', source_type='consumption', pass_transaction_id=해당 txn, amount=passes.unit_price_amount, class_type=수업유형, instructor_staff_id=담당강사)` (00-canon §4.2).
- 복구(`restore_*`, `manual_restore`)는 미소진으로 되돌리는 것이므로, 직전에 만든 소진 매출 레코드를 **음수 보정**(`source_type='refund'`, `amount=-unit_price_amount`)하거나, 동일 결과를 보장하는 상쇄 레코드를 1건 추가한다. (중복·누락 방지는 [`22-qa-checklist.md`])
- `manual_deduct`/`manual_restore`가 단순 보정(환불 회수 제외)일 때 소진 매출 반영 여부는 스튜디오 운영 판단에 따른다. **환불 회수용 `manual_deduct`는 소진 매출을 만들지 않는다**(돈을 돌려준 것이지 수업을 한 것이 아님).

### 7.5 수동 조정 권한·감사
- `manual_deduct`/`manual_restore`는 RBAC상 수강권/차감 리소스의 C/U 권한 보유자(owner/manager, 일부 info_staff)만 가능(00-canon §5).
- **모든 수동 조정은 `audit_logs`(`action=pass_adjust`, before/after, actor)** 에 반드시 기록한다(원본 §14 필수 규칙).

---

## 8. 만료임박 · 잔여부족 알림 트리거 (알림 연계)

수강권은 두 가지 자동 알림의 원천이다. 알림 유형·템플릿·발송 이력은 `notifications`/`notification_templates`가 소유하고(00-canon §2-H), 본 문서는 **트리거 조건**을 정의한다. 파라미터는 00-canon §6.2.

| 트리거 | `notification_type`(§3.20) | 조건 | 기본 파라미터 | 발송 시점 |
|---|---|---|---|---|
| 만료 임박 | `pass_expiring` | `pass_status='active'` 이고 `expire_date - today ≤ expiring_alert_days` 이고 `remaining_count > 0` | `expiring_alert_days`=7일 | 매일 자정 배치(스튜디오 타임존), 회원당 권당 1회(중복 발송 방지 플래그) |
| 잔여 부족 | `pass_low_count` | `pass_status='active'` 이고 `remaining_count ≤ low_count_threshold` 이고 `remaining_count > 0` | `low_count_threshold`=2회 | 차감으로 임계 도달하는 순간(이벤트성) |

추가 연계(원본 §11 알림 자동화와 연결, 트리거 조건만 표기):
- `remaining_count == 0` 도달 시(`used_up`) → 재등록 유도 흐름(`re_enroll` 알림 후보, `members.tag='re_enroll_likely'` 부여 검토).
- `expire_date` 경과로 `expired` 전이 시 → 재등록 캠페인 대상(`re_enroll`).
- 알림 채널 기본값은 `default_channel`(00-canon §6.4, 기본 `sms`, 2차 `kakao`).

> **중복 발송 방지**: 동일 수강권에 대해 같은 트리거가 반복 점화되지 않도록, 마지막 발송 여부를 `notifications` 이력으로 확인하거나 권별 발송 플래그를 둔다(만료 임박은 알림 후 만료일 변경 시에만 재발송).

---

## 9. 정책 파라미터 요약 (00-canon §6.2 — 본 문서 소유 상세화)

| 파라미터 | 키 | 기본값 | 본 문서 적용 절 |
|---|---|---|---|
| 정지 가능 여부 | `holdable` | true | §4.1 |
| 최대 정지일 | `max_hold_days` | 30일 | §4.1, §4.4 |
| 만료 연장 허용 | `extend_allowed` | true | §4.5 |
| 잔여 부족 알림 임계 | `low_count_threshold` | 2회 | §8 |
| 만료 임박 알림(일) | `expiring_alert_days` | 7일 | §8 |
| 환불 위약 공제율 | `refund_penalty_rate` | 0.10 | §5.1 (00-canon §6.3 소속, 환불 계산에 사용) |
| 환불 단가 산정 | `refund_unit_basis` | `list_price` | §5.1 (00-canon §6.3 소속) |
| 차감 시점 | `deduct_timing` | `on_attend` | §7.1 (00-canon §6.1 소속, 14-booking과 정합) |

> 상품 단위 오버라이드: `products.holdable`·`products.max_hold_days`가 스튜디오 기본값보다 우선한다. 발급 시점에 `passes`로 복사되어 고정된다(소급 변경은 신규 발급분부터 적용).

---

## 10. 무결성 체크리스트 (요약 — 상세는 22-qa-checklist)

1. `passes.remaining_count == total_count + Σ pass_transactions.delta` (불변식 #1, 항상).
2. `pass_transactions`는 append-only — UPDATE/DELETE 금지. 정정은 반대부호 보정 레코드로.
3. 차감 사유는 정책 `deduct_timing`에 따라 `deduct_booking` 또는 `deduct_attend` 중 하나만 사용.
4. `unit_price_amount`는 발급 시 고정. 라운딩 잔차는 마지막 소진 또는 조정 레코드로 보정(00-canon §4.2).
5. 홀딩 누적이 `max_hold_days` 초과분은 만료 연장에 미반영(§4.4).
6. 환불 시 결제기준은 음수 `revenue_records` 추가, 소진기준은 미소진분 자동 제외(§5.3).
7. 모든 수동 조정·홀딩·연장·환불은 `audit_logs` 필수(원본 §14).
8. 만료/소진 전이는 알림 트리거(`pass_expiring`/`pass_low_count`)와 연동(§8).

---

## 관련 문서

- [`00-canon.md`](./00-canon.md) — 단일 진실원천(`pass_kind`·`pass_status`·`pass_txn_reason`·§4 이중 손익·§6.2 정책 기본값)
- [`14-booking-policy.md`](./14-booking-policy.md) — 예약/취소/노쇼/차감 정책(차감 시점·노쇼·폐강 복구 동작 정합)
- [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) — 결제/환불 정책(`refunds`·`payment_status`·환불 절차)
- [`11-erd.md`](./11-erd.md) — `products`·`passes`·`pass_transactions` 상세 컬럼·인덱스·제약
- [`10-profit-dashboard.md`](./10-profit-dashboard.md) — 결제기준/소진기준 매출 토글 시각화
- [`19-metrics.md`](./19-metrics.md) — 소진기준 단가·수익성 지표 산식
- [`22-qa-checklist.md`](./22-qa-checklist.md) — 잔여 불변식·상태 전이·금액 검증 항목
