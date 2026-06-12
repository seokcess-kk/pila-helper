# 16-payment-refund-policy.md — 결제/환불 정책

> **목적**: 필라테스 샵의 결제와 환불을 "원장이 헷갈리지 않게, 매출 숫자가 두 번 잡히지 않게, 통장에 들어온 돈과 시스템 숫자가 어긋나지 않게" 다루기 위한 규칙을 정의한다. 결제수단별 기록 흐름, 결제 상태값의 정의·전이, 미수금·부분입금·분할 처리, 환불 계산과 그 환불이 **결제 기준 / 소진 기준 매출**과 수익지표에 미치는 영향, 회원 결제와 통장 입금의 매칭(결제측 규칙), 카드매출의 승인일/매입일/입금일 3단계 구분까지를 한 문서로 완결한다.

본 문서는 [`00-canon.md`](./00-canon.md)를 단일 진실원천(SSOT)으로 삼는다. 테이블명·컬럼명·enum 코드·역할명은 CANON과 **글자 단위로 일치**하며, 정의를 새로 만들지 않는다. 본 문서가 다루는 enum의 소유는 CANON에 있다: `payment_status`(§3.10) · `payment_method`(§3.11) · `revenue_basis`(§3.12) · `reconciliation_stage`(§3.21) · `match_target`(§3.19). 정책 기본값은 CANON §6.3에 있다. 근거 원본: [`_source-requirements.md`](./_source-requirements.md) §5(결제 관리) · §6(매출 관리) · §9(통장/카드 연동).

---

## 0. 한눈에 보는 결제→매출→입금의 전체 흐름

원장이 가장 먼저 이해해야 할 한 줄: **"결제(돈을 받기로 한 행위)"와 "입금(통장에 실제로 돈이 들어온 사건)"은 다른 사건이다.** 시스템은 이 둘을 분리해서 기록하고, 나중에 매칭한다.

```
[구매]                [결제]                 [매출 인식]                 [입금/대조]
purchases  ──1:1──▶  payments  ──생성──▶  revenue_records          bank_transactions
(주문 헤더)          (받기로 한 돈)       (payment 기준 1건)        (통장에 실제 들어온 돈)
   │                    │                      │                         │
   │                    │                 pass 차감마다              card_sales
   ▼                    ▼                 consumption N건           (승인→매입→입금 3단계)
 passes 발급        payment_status        revenue_records                │
 (수강권 인스턴스)   (결제완료/입금대기/    (소진 기준)                매칭 시 is_matched=true
                     일부입금/미수금/                                    reconciliation_stage=deposited
                     환불완료)
```

핵심 규칙 4가지(본문에서 상술):
1. **1구매 = 1결제 = 1수강권 발급**이 기본(CANON §2.20 `purchases`). 분할결제는 1구매에 여러 `payments`가 붙는 예외(§6).
2. **매출은 결제 시 `revenue_records`에 결제기준 1건**, 이후 **수업을 소진할 때마다 소진기준 N건**으로 따로 적재된다(CANON §4). 두 숫자를 더하지 않는다.
3. **입금대기/미수금은 "돈을 아직 못 받은 상태"**, 환불은 "받은 돈을 돌려준 사건"이다. 둘 다 결제기준 매출에 음수로 영향을 준다(환불) 또는 인식 보류(미수)된다.
4. **모든 결제 수정·환불은 `audit_logs`에 기록**(CANON §1.2, §5). 물리 삭제 금지, 소프트 삭제만.

---

## 1. 결제수단별 기록 흐름 (`payment_method`, CANON §3.11)

결제수단은 4종이다. `online`(온라인결제/PG)은 2~3차 확장이며 본 문서는 필드 예약까지만 다룬다.

| 코드 | 라벨 | 초기 결제 상태 | 입금 확정 방식 | 통장 매칭 대상 |
|---|---|---|---|---|
| `card_onsite` | 현장카드 | `paid` (현장 승인 즉시 결제완료) | 카드사 입금일에 통장 입금(§7 카드매출 3단계) | `card_sales` → `bank_transactions` |
| `transfer` | 계좌이체 | `awaiting_deposit` 또는 `paid` | 통장 입금 확인 시 `paid` 전이 | `bank_transactions`(입금자명 매칭) |
| `cash` | 현금 | `paid` (현금 수령 즉시) | 통장 미경유(현금 보유) | 통장 매칭 없음(현금시재 별도) |
| `online` | 온라인결제(PG, 2~3차) | PG 승인 콜백에 따름 | PG 정산일에 통장 입금 | `payment_provider`/`external_payment_id`로 PG 대사 |

### 1.1 현장카드 (`card_onsite`)

가장 흔한 케이스. 회원이 샵에서 카드를 긁는다.

1. 직원이 단말기로 카드 승인 → 승인번호를 받는다.
2. `purchases` 1건 생성(상품·정가·할인·실판매가), `passes` 발급(수강권 인스턴스).
3. `payments` 생성: `payment_method='card_onsite'`, `payment_status='paid'`, `amount = paid_amount = purchases.final_amount`, `card_approval_no`=승인번호, `paid_at`=승인시각, `staff_id`=담당.
4. **결제완료지만 통장 입금은 아직 아니다.** 카드사가 매입→정산을 거쳐 며칠 뒤 통장에 넣어준다. 이를 추적하려고 `card_sales` 1건을 함께 만든다(`reconciliation_stage='approved'`, `payment_id` 연결). 상세 §7.
5. 매출 인식: `revenue_records`에 `revenue_basis='payment'` 1건(=`paid_amount`).

> 원장 설명: "카드로 50만 원을 받았어도, 그 50만 원이 오늘 통장에 들어온 건 아니에요. 카드수수료(약 2.3%)를 뗀 나머지가 며칠 뒤 들어와요. 시스템은 '승인은 됐지만 아직 입금 안 됨'을 따로 보여줘요(미입금 카드매출)."

### 1.2 계좌이체 (`transfer`)

회원이 샵 사업자 통장으로 직접 이체. **결제 시점에 돈이 들어왔는지 모를 수 있다.**

- **케이스 A — 입금 확인 후 등록**: 통장에 들어온 걸 보고 등록 → `payment_status='paid'`, `paid_at`=입금 확인 시각, `depositor_name`=입금자명.
- **케이스 B — 선등록/후입금(입금대기)**: 회원이 "오늘 저녁에 보낼게요" → `payment_status='awaiting_deposit'`, `paid_amount=0`, `receivable_amount = amount`. 나중에 통장 입금 매칭 시 `paid`로 전이(§4.3, §6 매칭 연계).
- 필수: `depositor_name`(입금자명) — 통장 거래의 `counterparty_name`과 매칭하는 키(§6, [`17-reconciliation-policy.md`](./17-reconciliation-policy.md)).

### 1.3 현금 (`cash`)

현장 현금 수령. 즉시 `payment_status='paid'`. **통장을 거치지 않으므로 통장 매칭 대상이 아니다.** 현금시재 관리는 비용/정산 범위 밖(본 문서는 결제 인식만). `card_approval_no`·`depositor_name`은 비움.

### 1.4 온라인결제 (`online`, 2~3차)

PG(결제대행) 연동 시. MVP는 **필드만 예약**한다.
- `payment_provider`(PG사 코드, 예: `tosspayments`/`nicepay`), `external_payment_id`(PG 거래 고유 id) 채움.
- 승인 콜백으로 `paid`, 실패 시 미생성/취소. PG 정산일에 통장 입금 → `bank_transactions` 대사.
- CANON `payments` 핵심 컬럼에 `payment_provider`·`external_payment_id` 이미 존재. MVP에서는 NULL.

### 1.5 결제 1건 생성 예시(JSON)

```json
// 현장카드: 그룹 10회권 50만 원, 5만 원 할인 → 45만 원 결제
{
  "purchase": {
    "member_id": "...", "product_id": "...",
    "list_amount": 500000, "discount_amount": 50000, "final_amount": 450000,
    "seller_staff_id": "..."
  },
  "payment": {
    "purchase_id": "...", "member_id": "...",
    "payment_method": "card_onsite", "payment_status": "paid",
    "amount": 450000, "paid_amount": 450000, "receivable_amount": 0,
    "card_approval_no": "30021547", "depositor_name": null,
    "paid_at": "2026-06-12T05:10:00Z", "staff_id": "...", "memo": "현장 단말기 승인"
  },
  "card_sale": {
    "payment_id": "...", "approval_no": "30021547", "amount": 450000,
    "approved_at": "2026-06-12T05:10:00Z",
    "reconciliation_stage": "approved",
    "fee_amount": 10350, "net_deposit_amount": 439650
  }
}
```
> `fee_amount = round(amount × card_fee_rate)` = `round(450000 × 0.023)` = 10,350원. `net_deposit_amount = 450000 − 10350 = 439,650원`(CANON §6.3 `card_fee_rate`, §7).

---

## 2. 결제 상태값(`payment_status`)의 정의 (CANON §3.10)

| 코드 | 라벨 | 정의(원장용) | `paid_amount` | `receivable_amount` | 매출 인식(결제기준) |
|---|---|---|---|---|---|
| `paid` | 결제완료 | 받기로 한 돈을 **전액 받음** | = `amount` | 0 | 전액 인식 |
| `awaiting_deposit` | 입금대기 | 등록은 했지만 **아직 한 푼도 안 들어옴**(주로 이체) | 0 | = `amount` | 미인식(정책 §3) |
| `partial` | 일부입금 | **일부만** 받음(분할·부분입금 중) | 0 < x < `amount` | = `amount − paid_amount` | 받은 만큼만 인식(정책) |
| `receivable` | 미수금 | 받기로 했으나 **기한 지나도 못 받은** 잔액이 남음 | 0 ≤ x < `amount` | = `amount − paid_amount` | 미인식(별도 추적) |
| `refunded` | 환불완료 | 받은 돈을 **돌려줌**(전액/부분은 `refunds`로 판별) | 환불 반영 후 잔액 | 0 | 결제기준 매출에 음수 반영 |

핵심 산식(불변):
```
receivable_amount = amount − paid_amount   (단, refunded는 환불 반영 후 재계산)
```

> `awaiting_deposit`와 `receivable`의 차이: 둘 다 "돈을 못 받음"이지만, `awaiting_deposit`는 **정상적인 입금 대기**(곧 들어올 것), `receivable`는 **회수가 필요한 미수금**(기한 초과, 독촉 대상)이다. 전이 기준은 §3.6.

---

## 3. 결제 상태 전이 규칙

### 3.1 상태 전이 다이어그램

```
                         (전액 입금/현금/카드 즉시)
        ┌──────────────────────────────────────────────┐
        │                                               ▼
  [신규 payments] ──선등록/이체대기──▶ awaiting_deposit ──입금확인──▶  paid
        │                                  │                          │
        │                                  │부분입금                  │환불
        │                                  ▼                          ▼
        └──────────부분입금──────────▶  partial ──잔액완납──▶ paid   refunded
                                           │                          ▲
                                    기한초과 잔액 남음                  │부분환불은 paid 유지+refunds
                                           ▼                          │
                                       receivable ──완납회수──────────┘(→paid)
                                           │
                                       대손처리(정책)──▶ (잔액 0 또는 별도 손실)
```

### 3.2 허용 전이표 (가로=현재, 세로=다음)

| from \ to | paid | awaiting_deposit | partial | receivable | refunded |
|---|---|---|---|---|---|
| **(신규)** | ○ 즉시완납 | ○ 이체대기 | ○ 일부수령 | △ 드묾 | – |
| **awaiting_deposit** | ○ 입금확인 | – | ○ 일부입금 | ○ 기한초과 | △ 등록취소환불 |
| **partial** | ○ 잔액완납 | – | ○ 추가일부 | ○ 기한초과 | ○ 부분환불 |
| **receivable** | ○ 완납회수 | – | ○ 부분회수 | – | △ |
| **paid** | – | – | – | – | ○ 환불 발생 |
| **refunded** | – | – | – | – | – (종료) |

(○=정상 전이, △=예외/정책 승인 필요, –=금지)

### 3.3 전이 시 부수효과(side effect) 규칙

- 모든 상태 전이는 **`audit_logs`에 `action='update'`** (환불은 `action='refund'`)로 `before_json`/`after_json` 기록.
- `paid`로 전이되는 순간(입금 확정) → **결제기준 매출 인식**(§4.1, 정책 `revenue_recognition=on_deposit`이면 이 시점, `on_paid`이면 결제생성 시점).
- `refunded`/부분환불 → `refunds` 1건 + 결제기준 매출 음수 레코드(§5).
- `partial`/`receivable`로 잔액이 변할 때마다 `receivable_amount` 재계산.

### 3.4 `receivable`(미수금) 정의·관리·회수

**정의**: 받기로 약속한 금액(`amount`) 중 아직 못 받은 잔액(`receivable_amount = amount − paid_amount`)이 있고, **정상 입금 기한을 넘긴** 상태. (CANON §6.3 `allow_receivable=true`일 때만 발생 허용.)

**미수금이 잡히는 산식**:
```
미수금 총액 = Σ payments.receivable_amount
              where payment_status in ('receivable', 'partial')   (CANON §4.4)
```

**관리 화면 요건**:
- 미수금 회원 목록(이름·금액·발생일·경과일·담당자). 회원 태그 `receivable`(CANON §3.17) 자동 부여.
- 미수금 알림(`notification_type='receivable'`, CANON §3.20) 발송 → `notifications` 기록.
- 회수 처리: 회원이 돈을 보내오면 통장 입금 매칭(§6) 또는 수동 입금 등록 → `paid_amount` 증가 → 잔액 0이면 `paid`로 전이, 일부면 `partial` 유지.

**예시**: 50만 원 등록, 30만 원만 받고 20만 원이 한 달째 미납.
| 시점 | paid_amount | receivable_amount | payment_status |
|---|---|---|---|
| 등록(30만 수령) | 300,000 | 200,000 | `partial` |
| 입금기한(예: 14일) 초과 | 300,000 | 200,000 | `receivable` |
| 나중에 20만 회수 | 500,000 | 0 | `paid` |

> 입금대기 → 미수금 전이 기준(예: 등록 후 14일 무입금)은 스튜디오 운영 규칙으로 두되, 본 MVP는 **수동 전이 + 경과일 표시**로 구현하고, 자동 전이는 2차로 미룬다. (CANON에 고정 임계 파라미터가 없으므로 임의 신설하지 않음.)

---

## 4. 입금 확정과 매출 인식 시점

### 4.1 결제기준 매출 인식 시점 (`revenue_recognition`, CANON §6.3)

| 정책값 | 인식 시점 | 적합한 샵 |
|---|---|---|
| `on_paid` (기본) | `payments` 생성/`paid` 시 즉시 | 현장카드·현금 위주(받자마자 매출) |
| `on_deposit` | 통장 입금 확정(매칭) 시 | 이체 위주(실입금 확인 후 잡고 싶을 때) |

- 어느 정책이든 **`revenue_records`(`revenue_basis='payment'`) 1건**을 만든다(CANON §4.1). 차이는 `recognized_at`을 결제시각으로 잡느냐(`on_paid`), 입금시각으로 잡느냐(`on_deposit`).
- `awaiting_deposit`/`receivable`(미입금 잔액)은 **결제기준 매출에 포함하지 않거나 별도 표시**한다(CANON §4.1). 즉 미수금은 "매출이 아니라 받을 돈".

### 4.2 소진기준 매출 인식 시점 (CANON §4.2)

결제 상태와 **무관**하다. 수강권(`passes`)이 발급되어 회원이 수업을 소진(`pass_transactions` 차감)할 때마다 단가만큼 인식한다. 따라서 **입금대기 상태에서도 수업을 받으면 소진기준 매출은 잡힐 수 있다**(단가 = `passes.unit_price_amount`, [`15-pass-policy.md`](./15-pass-policy.md) 참조).

### 4.3 입금 확정 트리거(결제측)

`awaiting_deposit`/`partial`/`receivable` 결제가 통장 입금과 매칭되면:
1. 매칭된 `bank_transactions.amount`만큼 `paid_amount` 증가.
2. `receivable_amount` 재계산 → 0이면 `paid`, 0 초과면 `partial`/`receivable` 유지.
3. `on_deposit` 정책이면 이때 결제기준 매출 인식.
4. `audit_logs` + `transaction_reconciliation_logs` 기록.

---

## 5. 환불 정책 (`refunds`, CANON §2.22)

### 5.1 환불 기록 모델

환불은 결제를 "되돌리는" 것이 아니라 **별도 사건으로 추가 기록**한다(append, 원결제 보존).

`refunds` 핵심 컬럼(CANON §2.22): `payment_id`→`payments`, `purchase_id`→`purchases`, `member_id`, ★`refund_amount`, `refund_reason`, `refunded_at`, `restored_count`(복구 회수), ◆`status`(requested/completed/canceled), `refund_method`(§3.11 준용), `staff_id`.

| `refunds.status` | 라벨 | 의미 |
|---|---|---|
| `requested` | 환불요청 | 접수, 미실행 |
| `completed` | 환불완료 | 실제 환급 완료(통장/카드취소) |
| `canceled` | 환불취소 | 요청 철회 |

### 5.2 환불 계산 산식

환불 금액은 **"이미 사용한 분은 빼고, 남은 분을 위약공제 후 돌려준다"**가 기본. 사용분 단가는 `refund_unit_basis`(정가/실판매가), 위약은 `refund_penalty_rate`로 정한다(CANON §6.3).

표기:
- `final_amount` = 실판매가(=결제액 기준), `list_amount` = 정가
- `total_count` = 총횟수, `used_count` = 사용(소진) 횟수, `remaining_count` = 잔여횟수 = `total_count − used_count`
- `unit_price_basis` = (`refund_unit_basis=list_price` ? `round(list_amount / total_count)` : `round(final_amount / total_count)`)
- `penalty_rate` = `refund_penalty_rate` (예: 0.10)

**표준 환불 산식**:
```
사용분 차감액   = used_count × unit_price_basis
환불대상 베이스 = final_amount − 사용분 차감액
위약공제액      = round(환불대상 베이스 × penalty_rate)
refund_amount   = max(0, 환불대상 베이스 − 위약공제액)
restored_count  = remaining_count   (환불로 회수되는 잔여 횟수)
```

> 원장 설명: "회원이 50만 원짜리 10회권을 사서 3회 쓰고 환불을 원해요. 쓴 3회는 정가 기준으로 빼고(50만÷10=5만 → 3회=15만), 남은 35만 원에서 위약금 10%(3.5만)를 떼면 31.5만 원을 돌려드려요. 동시에 수강권의 남은 7회는 회수돼서 못 쓰게 막혀요."

### 5.3 환불 계산 예시(3종)

**가정**: 그룹 10회권, 정가 50만, 실판매가 45만(5만 할인), 위약 10%.

**예시 A — 정가 기준 사용분 공제(`refund_unit_basis=list_price`)**, 3회 사용:
```
unit_price_basis = round(500000 / 10) = 50,000
사용분 차감액    = 3 × 50,000 = 150,000
환불대상 베이스  = 450,000 − 150,000 = 300,000
위약공제액       = round(300,000 × 0.10) = 30,000
refund_amount    = 300,000 − 30,000 = 270,000
restored_count   = 7
```

**예시 B — 실판매가 기준(`refund_unit_basis=final_price`)**, 3회 사용:
```
unit_price_basis = round(450000 / 10) = 45,000
사용분 차감액    = 3 × 45,000 = 135,000
환불대상 베이스  = 450,000 − 135,000 = 315,000
위약공제액       = round(315,000 × 0.10) = 31,500
refund_amount    = 315,000 − 31,500 = 283,500
restored_count   = 7
```

**예시 C — 미사용 전액환불(0회 사용, 위약 면제 정책)**:
```
사용분 차감액 = 0,  환불대상 베이스 = 450,000
위약공제액    = 0 (단순변심 아닐 시 면제 등 스튜디오 규정)
refund_amount = 450,000,  restored_count = 10  → 수강권 pass_status='refunded'
```

> 위약 면제/축소는 스튜디오 운영 규정이며, 본 시스템은 `penalty_rate`를 0으로 입력해 처리한다. CANON에 없는 새 파라미터는 만들지 않는다.

### 5.4 부분환불 vs 전액환불

| 구분 | 조건 | `payments.payment_status` | `passes.pass_status` |
|---|---|---|---|
| 전액환불 | 잔여=전체(0회 사용) 또는 전액 환급 | `refunded` | `refunded` |
| 부분환불 | 일부 사용 후 잔여분 환급 | `refunded`(환불 발생 표시) 또는 `paid` 유지 + `refunds` 기록 | `refunded`(잔여 회수) |

- **`payment_status='refunded'`는 "이 결제에 환불이 발생함"을 표시**한다. 부분환불이어도 환불 사건이 있었으면 표시 가능하나, 환불액·잔액 판별은 항상 `refunds` 레코드를 본다(상태값만으로 금액을 추정하지 않는다).
- 환불 후 `paid_amount` 잔액 = `paid_amount(원) − refund_amount`(실수령 관점). 회계 표시는 원결제 유지 + 환불 음수 레코드로 한다(§5.5).

### 5.5 환불이 매출·수익지표에 미치는 영향

환불은 **두 매출 기준에 다르게** 작용한다(CANON §4.1, §4.2). 핵심: **소진된 분은 환불해도 매출에서 빼지 않는다(서비스를 이미 제공함). 미소진분만 환불 대상이고, 결제기준에서는 환불액을 음수로 깎는다.**

**(1) 결제기준(`revenue_basis='payment'`)**: 환불 발생 시 음수 레코드 1건 추가.
```
revenue_records: revenue_basis='payment', source_type='refund',
                 payment_id 연결, amount = − refund_amount,
                 recognized_at = refunds.refunded_at
→ 순매출 = Σ amount 이므로 자동으로 환불액만큼 차감됨
```

**(2) 소진기준(`revenue_basis='consumption'`)**: 환불로 잔여횟수가 복구(회수)되면, **그 미소진분은 애초에 소진 인식되지 않았으므로 자동으로 빠진다**(별도 음수 불필요). 이미 소진(차감)된 분은 그대로 매출로 남는다(CANON §4.2).
- 예외: 이미 소진된 회차까지 소급 환불해야 하면 `source_type='refund'`, `amount` 음수의 소진 조정 레코드로만 보정.

**환불의 지표 영향 요약표**:

| 지표 | 결제기준에서 환불 영향 | 소진기준에서 환불 영향 |
|---|---|---|
| 순매출 | **즉시 −refund_amount** | 미소진분은 원래 미인식 → 변화 없음(소진분은 유지) |
| 영업이익 | 순매출 감소만큼 감소 | 통상 변화 없음(소진분 매출·강사료 유지) |
| 환불액 위젯 | Σ `refunds.refund_amount` 표시 | 동일 표시(공통) |
| 회원 1인당 평균 매출 | 분자(순매출) 감소 | 소진분 기준 유지 |
| 강사별 수익성 | 영향 작음(상품 단위) | 소진된 회차만 귀속(환불로 회수된 미래 회차는 애초 미발생) |

> 원장 설명: "환불을 해주면 '결제로 잡았던 매출'은 그만큼 줄어요(통장에서 돈이 나가니까). 하지만 '실제로 수업해 드린 만큼'의 매출은 그대로예요(서비스는 이미 제공했으니까). 그래서 우리 대시보드는 환불 후에 두 숫자가 달라 보일 수 있고, 그게 정상이에요." (상세 시각화: [`10-profit-dashboard.md`](./10-profit-dashboard.md))

### 5.6 환불수수료·결제수수료 처리

- 카드 결제 취소 시 카드수수료가 환급되거나 안 되는 건 카드사 규정. 본 시스템은 `refund_amount`(회원에게 돌려준 돈)만 기록하고, 카드수수료 손실은 `expense_records.expense_category='payment_fee'`(CANON §3.13, 변동비)로 별도 인식한다([`18-expense-category-policy.md`](./18-expense-category-policy.md)).
- `refund_method`는 `payment_method`를 준용(현장카드 환불=카드취소, 이체/현금 환불=계좌송금 등).

### 5.7 환불 처리 절차(트랜잭션)

```
1. refunds 생성 (status='requested', refund_amount/restored_count 산정)
2. 실제 환급 실행(카드취소/계좌송금) → status='completed', refunded_at 기록
3. passes: remaining_count -= restored_count(회수) → pass_status='refunded'(잔여 0 처리)
   pass_transactions: reason='manual_restore' 또는 환불회수 조정 1건(audit)
4. payments: payment_status='refunded'(또는 paid 유지+refunds 표시), paid_amount 재계산
5. revenue_records: payment 기준 음수 1건(amount=-refund_amount) 추가
6. audit_logs: action='refund', before/after JSON 기록 (CANON §5 필수)
```

---

## 6. 회원 결제 ↔ 통장 입금 매칭 (결제측 규칙, [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) 연계)

본 문서는 **결제(payments) 쪽 규칙**만 정의한다. 통장 거래내역의 분류·자동추천·규칙엔진은 17번 문서가 소유한다.

### 6.1 매칭 키와 대상

| 결제수단 | 매칭 상대 | 매칭 키 | 결과 |
|---|---|---|---|
| `transfer` | `bank_transactions`(입금) | `depositor_name` ↔ `counterparty_name`, `amount`, `txn_date≈paid 예정일` | `payment_status` → `paid`, `paid_amount` 증가 |
| `card_onsite` | `card_sales` → `bank_transactions` | `card_approval_no`/금액/입금일 | `card_sales.reconciliation_stage='deposited'` |
| `cash` | 매칭 없음 | – | 통장 미경유 |
| `online` | `bank_transactions`(PG 정산) | `external_payment_id`/정산금액 | `paid` 확정·대사 |

### 6.2 계좌이체 입금 매칭 흐름

1. 통장 CSV 업로드 → `bank_transactions`에 입금건 적재(`direction='deposit'`).
2. 입금대기(`awaiting_deposit`)/미수(`receivable`/`partial`) `payments` 중 **입금자명·금액 근접 후보**를 자동 추천(17 규칙).
3. 직원이 확정 → `bank_transactions.match_target='revenue'`, `matched_ref_type='payment'`, `matched_ref_id=payment.id`, `is_matched=true`.
4. 결제측 부수효과: `paid_amount` 증가 → 상태 전이(§4.3) → (정책 `on_deposit`이면) 매출 인식.
5. `transaction_reconciliation_logs`에 `action='manual_matched'`(또는 `auto_matched`) 기록.

### 6.3 부분입금 매칭

한 결제(50만)에 두 번 입금(30만+20만)이 들어오면, **두 `bank_transactions` 모두 같은 `payment_id`에 매칭**되고 `paid_amount`가 누적된다(`partial` → 완납 시 `paid`). 반대로 한 입금이 여러 회원 결제를 한 번에 덮는 경우(드묾)는 17 문서의 분할 매칭 규칙을 따른다.

### 6.4 매칭 불일치(예외) 처리

- 금액은 같은데 입금자명이 회원명과 다름(가족 명의) → 수동 매칭 후 `depositor_name` 갱신, 규칙(`transaction_matching_rules`) 등록 시 다음부터 자동.
- 입금이 결제보다 많음(과입금) → 차액은 `match_target='etc'` 또는 별도 처리. 결제 `paid_amount`는 `amount`를 초과하지 않게 캡.
- 매칭되지 않은 통장 입금은 17의 "미매칭 거래 목록"으로 남는다.

---

## 7. 카드매출 승인일/매입일/입금일 3단계 구분 (`reconciliation_stage`, CANON §3.21)

현장카드는 "받자마자 통장에 들어오는 돈"이 아니다. 카드사가 **승인 → 매입 → 입금** 3단계를 거치고, 수수료를 뗀 나머지가 며칠 뒤 통장에 들어온다. 이를 `card_sales`로 추적한다(CANON §2.29).

### 7.1 3단계 정의

| 단계(`reconciliation_stage`) | 라벨 | 컬럼 | 의미 | 통장 상태 |
|---|---|---|---|---|
| `approved` | 승인 | `approved_at`(승인일) | 카드 단말기 승인 완료 | 미입금 |
| `captured` | 매입 | `captured_at`(매입일) | 카드사 매입 처리 | 미입금 |
| `deposited` | 입금 | `deposited_at`(입금일) | 사업자 통장 입금 완료 | **입금됨**(`bank_transactions` 매칭) |

### 7.2 금액 컬럼

```
fee_amount         = round(amount × card_fee_rate)        (CANON §6.3, 기본 0.023)
net_deposit_amount = amount − fee_amount                  (실제 통장 입금액)
```

예: 승인 450,000 → 수수료 10,350 → 실입금 439,650.

### 7.3 미입금 카드매출(원장 핵심 지표)

```
미입금 카드매출 = Σ card_sales.net_deposit_amount
                  where reconciliation_stage != 'deposited'   (CANON §4.4)
```
> 원장 설명: "이번 주 카드로 300만 원을 받았는데 아직 통장엔 안 들어왔어요. 이게 '미입금 카드매출'이에요. 이 돈은 곧 (수수료 뗀 약 293만 원이) 들어올 예정이라 현금흐름 계획에 꼭 봐야 해요." (대시보드: [`10-profit-dashboard.md`](./10-profit-dashboard.md), [`09-admin-dashboard.md`](./09-admin-dashboard.md))

### 7.4 입금 매칭(deposited 전이)

1. 통장 CSV에서 카드사 입금건(`counterparty_name`에 카드사명) 식별.
2. `card_sales` 중 금액·입금일이 맞는 건과 매칭 → `deposited_at` 채움, `reconciliation_stage='deposited'`, `bank_transaction_id` 연결.
3. 해당 `bank_transactions.reconciliation_stage='deposited'`, `match_target='revenue'`.
4. 카드 정산은 보통 **여러 승인건을 묶어 한 번에 입금**(일괄정산)되므로, 입금 1건 ↔ 카드매출 N건의 다대일 매칭을 허용한다(17 문서 분할 규칙 준용).

### 7.5 카드매출과 결제기준 매출의 관계

- 결제기준 매출은 **승인 시점**에 이미 인식(`payments` 생성 시). 카드매출 3단계는 **입금(현금흐름) 추적용**이지, 매출을 다시 잡는 게 아니다(이중계상 금지).
- 카드수수료(`fee_amount`)는 매출에서 직접 빼지 않고, 비용(`payment_fee`, 변동비)으로 인식한다([`18-expense-category-policy.md`](./18-expense-category-policy.md)). 즉 총매출=승인액, 결제수수료는 비용 → 영업이익에서 차감.

---

## 8. 필수 필드 정의 (`payments`, 원본 §5 + CANON §2.21)

| 필드 | 컬럼 | 필수 | 설명 |
|---|---|---|---|
| 결제일 | `paid_at` | 조건부 | 입금/승인 시각(미수·대기 시 NULL 가능) |
| 수단 | `payment_method` | ✔ | CANON §3.11 |
| 금액 | `amount` | ✔ | 받기로 한 총액 |
| 실수령액 | `paid_amount` | ✔ | 실제 받은 금액(미수 반영) |
| 미수금 | `receivable_amount` | ✔ | `amount − paid_amount` |
| 상품 | `purchase_id` → `purchases.product_id` | ✔ | 어떤 상품 결제인지 |
| 담당자 | `staff_id` | ✔ | 결제 처리 직원 |
| 메모 | `memo` | – | 비고 |
| 카드승인번호 | `card_approval_no` | 조건부 | `card_onsite` 시 필수 |
| 입금자명 | `depositor_name` | 조건부 | `transfer` 시 필수(매칭 키) |
| PG사 | `payment_provider` | 2~3차 | `online` 대비, MVP NULL |
| 외부결제ID | `external_payment_id` | 2~3차 | `online` 대비, MVP NULL |
| 상태 | `payment_status` | ✔ | CANON §3.10 |

검증 규칙(요약):
- `card_onsite` → `card_approval_no` 필수, `card_sales` 1건 동반 생성.
- `transfer` + `awaiting_deposit` → `paid_amount=0`, `depositor_name` 필수.
- `amount > 0`, `0 ≤ paid_amount ≤ amount`, `receivable_amount = amount − paid_amount`.
- 환불 후 금액 정합: `Σ refunds.refund_amount ≤ paid_amount(누적)`.

---

## 9. 일/월별 결제 리포트 (원본 §5)

결제 리포트는 매출 인식과 별개로 **"결제 사건"** 자체를 집계한다(현금 유입 관점).

| 리포트 | 집계 기준 | 산식(예) |
|---|---|---|
| 일별 결제 합계 | `paid_at`의 날짜 | Σ `paid_amount` group by `recognized_date` |
| 수단별 결제 | `payment_method` | Σ `paid_amount` group by 수단 |
| 입금대기/미수 현황 | 상태 | Σ `receivable_amount` where status in (awaiting_deposit, partial, receivable) |
| 환불 합계 | `refunded_at` | Σ `refund_amount` |
| 미입금 카드매출 | `card_sales` | Σ `net_deposit_amount` where stage != deposited |

(수익분석용 매출 산식은 [`19-metrics.md`](./19-metrics.md)가 소유. 본 리포트는 운영 현금흐름 점검용.)

---

## 10. 권한·감사 (CANON §5)

| 액션 | owner | manager | info_staff | accountant | instructor | member |
|---|---|---|---|---|---|---|
| 결제 등록(C) | ✔ | ✔ | ✔ | – | – | – |
| 결제 수정(U) | ✔ | ✔ | – | – | – | – |
| 환불 처리 | ✔ | △(승인) | – | – | – | – |
| 결제/미수 조회(R) | ✔(all) | ✔ | ✔(own studio) | ✔ | – | ✔(own) |
| 매출/수익 조회 | ✔ | 요약 | – | ✔ | – | – |

(CANON §5 RBAC 스켈레톤 준수. 상세는 [`13-rbac.md`](./13-rbac.md).)

- **모든 결제 생성·수정·환불·미수 회수는 `audit_logs` 필수**(`action` ∈ create/update/refund), `before_json`/`after_json` 기록.
- 결제 레코드는 **물리 삭제 금지**, `deleted_at` 소프트 삭제만(금전·감사 데이터, CANON §1.2).

---

## 11. 핵심 산식 모음 (Quick Reference)

```
receivable_amount = amount − paid_amount
미수금 총액       = Σ payments.receivable_amount  where status in (receivable, partial)
환불액            = Σ refunds.refund_amount
순매출(결제기준)  = Σ revenue_records.amount  where revenue_basis='payment'   (환불 음수 포함)
순매출(소진기준)  = Σ revenue_records.amount  where revenue_basis='consumption'

[환불]
unit_price_basis  = round((refund_unit_basis=list_price ? list_amount : final_amount) / total_count)
사용분 차감액      = used_count × unit_price_basis
환불대상 베이스    = final_amount − 사용분 차감액
위약공제액        = round(환불대상 베이스 × refund_penalty_rate)
refund_amount     = max(0, 환불대상 베이스 − 위약공제액)
restored_count    = remaining_count

[카드매출]
fee_amount         = round(amount × card_fee_rate)
net_deposit_amount = amount − fee_amount
미입금 카드매출    = Σ card_sales.net_deposit_amount  where reconciliation_stage != 'deposited'
```

---

## 관련 문서

- [`00-canon.md`](./00-canon.md) — 단일 진실원천(SSOT): `payment_status`/`payment_method`/`revenue_basis`/`reconciliation_stage` 정의·정책 기본값 §6.3
- [`_source-requirements.md`](./_source-requirements.md) — 원본 요구사항 §5(결제) · §6(매출) · §9(통장/카드)
- [`15-pass-policy.md`](./15-pass-policy.md) — 수강권 단가(`unit_price_amount`)·잔여·정지·환불 회수 연동
- [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) — 통장/카드 거래내역 매칭(통장측 규칙·자동분류)
- [`18-expense-category-policy.md`](./18-expense-category-policy.md) — 결제수수료(`payment_fee`) 등 비용 인식
- [`19-metrics.md`](./19-metrics.md) — 순매출·영업이익·미수금 등 수익지표 산식
- [`10-profit-dashboard.md`](./10-profit-dashboard.md) · [`09-admin-dashboard.md`](./09-admin-dashboard.md) — 결제/환불 지표 시각화(미입금 카드매출·미수금)
- [`13-rbac.md`](./13-rbac.md) — 결제/환불 권한 상세
