# 19-metrics.md — 수익분석 지표 정의

> **목적**: 원장이 회계 지식 없이도 "이번 달 우리 샵이 얼마 벌었고, 얼마 썼고, 진짜 남는 게 얼마인지"를 10초 안에 이해하도록, 수익분석 대시보드에 표시되는 **모든 지표의 정의·산식·데이터소스·결제기준/소진기준 구분·해석 팁**을 한 곳에 못박는다. 이 문서는 `09-admin-dashboard.md`·`10-profit-dashboard.md` 위젯이 표시하는 **모든 숫자의 산식 정본(SSOT for formulas)** 이다.

본 문서는 [`00-canon.md`](./00-canon.md)의 **§4 이중 손익 회계 모델**, **§2 엔티티 사전**, **§3 enum 사전**, **§6 정책 파라미터**를 글자 단위로 준수한다. 충돌 시 `00-canon.md`가 우선한다. 근거 원본은 [`_source-requirements.md`](./_source-requirements.md) §8(수익분석 지표) · §13(관리자 대시보드 4영역)이다.

---

## 0. 읽는 법 — 이 문서를 쓰는 4가지 규칙

### 0.1 모든 지표는 카드 한 장으로 정의한다

각 지표 카드는 아래 6요소를 갖는다.

1. **[지표명]** — UI 라벨(한글) + 코드명(snake_case).
2. **한 줄 설명** — 원장(비전문가)이 이해할 표현.
3. **산식** — 정확한 수식. 변수는 모두 CANON 테이블·필드로 환원.
4. **데이터소스** — `테이블.필드` 단위로 명시.
5. **기준 구분** — 결제기준(`payment`)/소진기준(`consumption`) 중 어디에 속하는지. 둘 다인 경우 둘 다 명시.
6. **주의·해석 팁** — 오해하기 쉬운 점, 함께 봐야 할 지표.

### 0.2 결제기준 vs 소진기준 — 절대 섞지 않는다 (CANON §4)

> **핵심 원칙: 한 화면에서 합산하는 매출은 반드시 하나의 `revenue_basis`만 사용한다.**
> 결제기준과 소진기준을 더하면 같은 돈을 두 번 세는 **이중 합산(double counting)** 이 된다. 대시보드 상단의 **기준 토글**(결제기준 / 소진기준)이 모든 매출·이익 지표에 일괄 적용된다.

| 기준 | 코드 | "원장님이 이해할" 한 줄 | 인식 시점 | 주 용도 |
|---|---|---|---|---|
| 결제기준 | `payment` | **돈이 들어온 날** 매출로 잡는다 | 결제 시점(`payments.paid_at`) | 현금흐름·자금관리 |
| 소진기준 | `consumption` | **수업을 쓴 날** 그만큼만 매출로 잡는다 | 수강권 차감 시점(`pass_transactions`) | 원가·수익성·강사료 |

- 매출 1건의 흐름: 회원이 100만원짜리 20회권을 결제 → **결제기준은 그날 100만원 1건**, **소진기준은 수업 1회 쓸 때마다 5만원씩 20번**. 두 기준의 "총합"은 환불·잔차가 없으면 같아지지만, **인식되는 시점(달)이 다르다**.
- 강사별/수업유형별 분해(`class_type`, `instructor_staff_id`)는 **소진기준에서만** 가능하다(결제기준은 상품 단위라 어느 수업에 귀속되는지 모른다).

### 0.3 매출·비용의 단일 출처 (이중 합산 금지)

- **매출**은 항상 `revenue_records` 한 테이블에서만 합산한다. `payments`/`purchases`/`refunds`는 **드릴다운·검증용 교차 확인 소스**일 뿐 합산 대상이 아니다.
- **비용**은 항상 `expense_records` 한 테이블에서만 합산한다. `card_expenses`/`bank_transactions`는 매칭되어 `expense_records`가 생성된 뒤에야 비용에 잡힌다. 미매칭 거래는 "분류 대기"로만 표시하고 합계에 넣지 않는다.
- 모든 집계는 `deleted_at IS NULL` + `tenant_id` + `studio_id` 필터를 기본으로 한다(CANON §1.2).

### 0.4 기간·통화 규약 (CANON §1.3, §1.4)

- 모든 금액은 **정수(원, KRW)**. 표시 시 천단위 콤마, 옵션으로 만원 환산.
- 비율(`_rate`)은 저장하지 않고 **조회 시 계산**. 표시: 백분율 + "100원 중 ○원" 환산 병기 옵션.
- "이번 달" = 스튜디오 타임존(`Asia/Seoul`) 기준 `recognized_date`/`expense_date`가 해당 월에 속하는 레코드. 분모가 0이면 지표는 `null`(UI는 "–").

---

## 1. 매출 지표 (Revenue)

> 출처 단일화: 모두 `revenue_records`. 토글된 `revenue_basis`(`payment` 또는 `consumption`)로 필터.

### 1.1 총매출 (gross_revenue)

- **한 줄 설명**: 환불을 빼기 전, 이번 달에 들어온(또는 소진된) 매출의 합. "할인·환불 반영 전 총 매출".
- **산식**:
  ```
  총매출 = Σ revenue_records.amount
           WHERE revenue_basis = {선택된 기준}
             AND source_type IN ('payment','consumption')   -- 환불(refund) 제외
             AND recognized_date ∈ [월초, 월말]
  ```
- **데이터소스**: `revenue_records.amount`, `.revenue_basis`, `.source_type`, `.recognized_date`.
- **기준 구분**: **둘 다**.
  - 결제기준: `source_type='payment'`, `amount = payments.paid_amount`(실수령).
  - 소진기준: `source_type='consumption'`, `amount = passes.unit_price_amount` 회차 합.
- **주의·해석 팁**: 환불을 포함하지 않은 "겉으로 들어온 돈". 실제 남는 돈은 **순매출(1.3)** 로 본다. 결제기준 총매출이 소진기준보다 크면 → 이번 달 **선결제가 많았다(앞으로 소진될 수업이 쌓였다)** 는 뜻.

### 1.2 환불액 (refund_amount)

- **한 줄 설명**: 이번 달 회원에게 돌려준 돈의 합. 매출에서 깎이는 금액.
- **산식**:
  ```
  환불액 = Σ |revenue_records.amount|
           WHERE source_type = 'refund'
             AND revenue_basis = 'payment'         -- 기준 토글과 무관하게 결제기준 환불로 고정
             AND recognized_date ∈ [월초, 월말]
  -- 교차검증(권장 정본): = Σ refunds.refund_amount (status='completed', refunded_at ∈ 월)
  ```
- **데이터소스**: `revenue_records.amount`(음수로 적재, `source_type='refund'` AND `revenue_basis='payment'`) / 교차검증 정본 `refunds.refund_amount`, `.status`, `.refunded_at`.
- **기준 구분**: **고정(결제기준 환불)**. 토글과 무관하게 **항상 결제기준 환불**(`source_type='refund'` AND `revenue_basis='payment'`, 동치 `refunds.refund_amount`)로 표기한다. 환불은 결제기준에서만 `source_type='refund'` 음수 1건으로 적재되고, 소진기준은 미소진분이 애초에 인식되지 않아 통상 `refund` 레코드를 만들지 않기 때문이다(CANON §4.2, [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) §5.5). 따라서 환불액 위젯을 `revenue_basis = {선택된 기준}`으로 필터하면 소진기준 토글 시 0이 되어 `09-admin-dashboard.md` 2-2(basis 무관, `source_type='refund'`만)와 값이 어긋난다 → **두 문서를 결제기준 환불로 통일**한다.
- **소진기준 토글 시 표시 규칙**: 환불액 위젯은 **기준 토글의 영향을 받지 않는다**. 소진기준으로 토글해도 위젯은 **결제기준 환불 값을 그대로 유지·표기**하며(0으로 떨어뜨리지 않는다), "환불은 결제기준 고정" 보조 라벨을 단다. 단, **순매출(1.3) 합산**에는 소진기준의 환불 정합(미소진분 자동 제외, CANON §4.2)을 그대로 따르므로, 이 환불액 위젯 값을 소진기준 순매출에서 다시 차감하지 않는다(이중 차감 금지).
- **주의·해석 팁**: 환불액은 **양수로 표시**하되 결제기준 매출 계산에서는 음수로 작용. 환불 사유(`refunds.refund_reason`) 드릴다운으로 "왜 환불이 많은가"를 추적. 위약 공제율(`refund_penalty_rate`, 기본 0.10)은 [`16-payment-refund-policy.md`](./16-payment-refund-policy.md)가 소유.

### 1.3 순매출 (net_revenue)

- **한 줄 설명**: 환불까지 빼고 **실제로 우리 샵에 남은 매출**. 영업이익 계산의 출발점.
- **산식**:
  ```
  순매출 = Σ revenue_records.amount
           WHERE revenue_basis = {선택된 기준}
             AND recognized_date ∈ [월초, 월말]
  -- (refund 레코드의 amount가 이미 음수이므로 단순 합산하면 환불 차감 완료)
  -- 동치(결제기준): 순매출(payment) = 총매출(1.1) − 환불액(1.2)
  -- 소진기준: refund 레코드가 통상 없고 미소진분은 애초에 미인식이므로(CANON §4.2),
  --          단순 합산만으로 환불 정합이 끝난다. 환불액(1.2, 결제기준 고정)을 여기서 다시 빼지 않는다(이중 차감 금지).
  ```
- **데이터소스**: `revenue_records.amount`, `.revenue_basis`, `.recognized_date`.
- **기준 구분**: **둘 다**. 대시보드 영업이익·이익률·1인당 매출의 분모는 모두 이 순매출. 위 동치식(총매출 − 환불액)은 **결제기준에서만** 성립한다(환불액 1.2가 결제기준 고정이므로). 소진기준 순매출은 위 단순 합산 결과를 그대로 쓴다.
- **주의·해석 팁**: 원장에게 보여줄 "이번 달 매출"의 대표값. **반드시 어느 기준인지 라벨을 함께 표시**("순매출(결제기준)"). 결제기준 순매출은 통장에 들어온 현금 감각에 가깝고, 소진기준 순매출은 실제 제공한 서비스 가치에 가깝다.

---

## 2. 비용 지표 (Cost)

> 출처 단일화: 모두 `expense_records`. 비용은 결제/소진 기준과 무관하게 **`expense_date` 기준**으로 동일 집계(아래 표 주의 참조).

### 2.1 총비용 (total_cost)

- **한 줄 설명**: 이번 달 샵 운영에 나간 돈 전부(임대료·인건비·강사료·광고비 등).
- **산식**:
  ```
  총비용 = Σ expense_records.amount
           WHERE expense_date ∈ [월초, 월말]
             AND deleted_at IS NULL
  ```
- **데이터소스**: `expense_records.amount`, `.expense_date`, `.expense_category`, `.cost_type`.
- **기준 구분**: 기준 무관(공통). 단, 소진기준 손익에서는 **강사료를 소진 회차에 매칭**해 수업원가로 보는 정교화가 가능(2.5 참조).
- **주의·해석 팁**: 미매칭 통장/카드 거래는 비용에 안 잡힌다 → "분류 대기 N건"을 함께 노출해 **누락 비용 경고**. [`17-reconciliation-policy.md`](./17-reconciliation-policy.md)·[`18-expense-category-policy.md`](./18-expense-category-policy.md) 참조.

### 2.2 고정비 (fixed_cost)

- **한 줄 설명**: 매출과 상관없이 매달 거의 일정하게 나가는 돈(임대료·관리비·인건비·통신비·세무기장료·보험료 등).
- **산식**:
  ```
  고정비 = Σ expense_records.amount
           WHERE cost_type = 'fixed' AND expense_date ∈ [월초, 월말]
  ```
- **데이터소스**: `expense_records.amount`, `.cost_type`(='fixed'). 기본 `cost_type`은 `expense_categories.default_cost_type`(CANON §3.13).
- **기준 구분**: 공통.
- **주의·해석 팁**: 고정비가 클수록 **손익분기 회원 수가 높다**(많이 팔아야 본전). 고정비÷객단가 ≈ "최소 등록 회원 수" 감을 잡는 데 활용.

### 2.3 변동비 (variable_cost)

- **한 줄 설명**: 매출·수업량에 따라 늘었다 줄었다 하는 돈(강사료·광고비·결제수수료·소모품비 등).
- **산식**:
  ```
  변동비 = Σ expense_records.amount
           WHERE cost_type = 'variable' AND expense_date ∈ [월초, 월말]
  -- 항등식: 고정비 + 변동비 = 총비용
  ```
- **데이터소스**: `expense_records.amount`, `.cost_type`(='variable').
- **기준 구분**: 공통.
- **주의·해석 팁**: 변동비율(변동비÷순매출)이 높으면 매출이 늘어도 이익이 더디게 는다(공헌이익이 낮음). 강사료·광고비 효율을 우선 점검.

### 2.4 광고비 (advertising_cost)

- **한 줄 설명**: 이번 달 신규 회원을 모으려고 쓴 마케팅 비용.
- **산식**:
  ```
  광고비 = Σ expense_records.amount
           WHERE expense_category = 'advertising' AND expense_date ∈ [월초, 월말]
  ```
- **데이터소스**: `expense_records.amount`, `.expense_category`(='advertising').
- **기준 구분**: 공통. **CAC(6.3)의 분자**로 직결.
- **주의·해석 팁**: 광고비는 항상 **유입경로별 성과(5.4)·CAC(6.3)·ROAS**와 함께 본다. "광고비를 썼는데 신규/매출이 안 늘었다"가 가장 위험한 신호.

### 2.5 강사료 (instructor_fee)

- **한 줄 설명**: 강사에게 지급한(또는 지급 예정인) 수업료. 변동비의 핵심.
- **산식**:
  ```
  강사료(지출 기준) = Σ expense_records.amount
                     WHERE expense_category = 'instructor_fee'
                       AND expense_date ∈ [월초, 월말]

  강사료(정산 기준, 교차검증) = Σ settlements.total_amount
                              WHERE period 겹침 AND status IN ('confirmed','paid')
  ```
- **데이터소스**: `expense_records.amount`, `.expense_category`(='instructor_fee'), `.staff_id`(귀속 강사). 교차검증 `settlements.total_amount`, `.status`, `.session_count`.
- **기준 구분**: 공통. **소진기준 수익성**에서는 강사료를 강사별 소진매출의 원가로 매칭해 **강사별 수익성(5.3)** 산정에 사용.
- **주의·해석 팁**: 강사료는 "지출 원장(`expense_records`)"과 "정산 집계(`settlements`)" 두 출처가 있다 → **마감 시 두 값이 일치하는지 대조**. 차이는 미지급 강사료 또는 분류 누락 신호.

### 2.6 카드수수료 (card_fee)

- **한 줄 설명**: 카드로 결제받을 때 카드사가 떼어가는 수수료. "100만원 긁으면 통장엔 97만 7천원만".
- **산식**:
  ```
  실적용 카드수수료 = Σ card_sales.fee_amount
                     WHERE approved_at(or deposited_at) ∈ [월초, 월말]

  추정 카드수수료(연동 전) = Σ payments.paid_amount
                          × studios.policy_json.card_fee_rate(기본 0.023)
                          WHERE payment_method = 'card_onsite'

  실입금액 = card_sales.amount − card_sales.fee_amount = card_sales.net_deposit_amount
  ```
- **데이터소스**: `card_sales.fee_amount`, `.net_deposit_amount`, `.amount` / 추정 시 `payments.paid_amount`, `payments.payment_method`(='card_onsite'), `studios.policy_json.card_fee_rate`.
- **기준 구분**: 공통(비용). 매출은 결제 전액으로 인식하되, **수수료는 비용으로 별도 차감**(매출을 깎지 않는다).
- **주의·해석 팁**: MVP(카드매출 미연동)에서는 **추정율(0.023)** 로 계산하고 "추정치" 배지를 단다. 2차 카드매출 조회 연동 후 `card_sales.fee_amount` 실값으로 대체. 비용 카테고리는 `payment_fee`(결제수수료)에 적재.

---

## 3. 손익 지표 (Profit)

### 3.1 영업이익 (operating_profit)

- **한 줄 설명**: 매출에서 모든 비용을 빼고 **진짜 남은 돈**. 원장이 가장 궁금한 한 숫자.
- **산식**:
  ```
  영업이익 = 순매출(1.3) − 총비용(2.1)
           = Σ revenue_records.amount[basis] − Σ expense_records.amount
  ```
- **데이터소스**: `revenue_records.amount`(선택 기준), `expense_records.amount`.
- **기준 구분**: **둘 다**(순매출이 기준에 따라 달라지므로 영업이익도 기준별로 다르다).
  - 결제기준 영업이익 = 이번 달 들어온 현금 기준 이익(자금 감각).
  - 소진기준 영업이익 = 이번 달 실제 제공한 서비스 기준 이익(진짜 수익성).
- **주의·해석 팁**: **반드시 기준 라벨 표기**("영업이익(소진기준)"). 결제기준은 선결제 많은 달에 부풀고, 소진기준은 평탄하다. 두 값을 나란히 보면 "현금은 좋은데 실제 수익성은?" 같은 판단이 가능.

### 3.2 영업이익률 (operating_profit_rate)

- **한 줄 설명**: 매출 100원 중 몇 원이 이익으로 남는가. 샵의 "체질".
- **산식**:
  ```
  영업이익률 = 영업이익(3.1) ÷ 순매출(1.3)
            (순매출 = 0 이면 null → UI "–")
  표시: 백분율 + "100원 중 ○원" 병기
  ```
- **데이터소스**: 3.1·1.3과 동일.
- **기준 구분**: **둘 다**. 분자·분모 모두 같은 기준으로 맞춰야 한다(섞으면 무의미).
- **주의·해석 팁**: 저장하지 않고 조회 시 계산(CANON §1.3, `_rate`는 numeric(7,4) 저장 시에도 조회계산 우선). 단일 월 변동이 크므로 **3개월 이동평균**을 함께 보여주면 추세 판단에 유리.

---

## 4. 현금·채권 지표 (Cash & Receivables)

> 이 영역은 **결제기준/소진기준과 무관한 "현금 실태" 지표**다. 통장에 실제 있는 돈, 아직 못 받은 돈을 본다.

### 4.1 통장잔액 (bank_balance)

- **한 줄 설명**: 지금 사업자 통장에 실제로 있는 돈.
- **산식**:
  ```
  통장잔액 = Σ bank_accounts.balance_amount   (status='active')
  -- 또는 가장 최근 거래의 잔액 스냅샷:
  통장잔액 = bank_transactions.balance_after_amount  (가장 큰 txn_date의 값)
  ```
- **데이터소스**: `bank_accounts.balance_amount`, `.last_synced_at`, `.status` / `bank_transactions.balance_after_amount`, `.txn_date`.
- **기준 구분**: 공통(현금 실태).
- **주의·해석 팁**: **매출 ≠ 통장잔액**. 선결제·미입금·미수금 때문에 매출과 잔액은 다르다. `last_synced_at`이 오래됐으면 "동기화 N일 전" 경고. **강사·매니저는 통장잔액 접근 불가**(CANON §5).

### 4.2 미입금 카드매출 (undeposited_card_sales)

- **한 줄 설명**: 카드로 결제는 받았지만 **아직 통장에 안 들어온 돈**(보통 2~3영업일 시차).
- **산식**:
  ```
  미입금 카드매출 = Σ card_sales.net_deposit_amount
                  WHERE reconciliation_stage IN ('approved','captured')  -- 'deposited' 제외
                    AND deleted_at IS NULL
  ```
- **데이터소스**: `card_sales.net_deposit_amount`, `.reconciliation_stage`(CANON §3.21: approved/captured/deposited), `.approved_at`, `.deposited_at`.
- **기준 구분**: 공통(현금 실태). **월말 예상 현금잔고(5.8)** 의 핵심 입력.
- **주의·해석 팁**: 카드매출은 **승인일→매입일→입금일** 3단계(CANON §3.21). `deposited`로 넘어가면 통장거래(`bank_transactions`)와 매칭되어 미입금에서 빠진다. 월말에 이 금액이 크면 "장부상 이익은 있는데 통장은 비어 보이는" 착시의 원인.

### 4.3 미수금 (receivable)

- **한 줄 설명**: 회원이 등록은 했는데 **아직 다 안 낸 돈**(외상). 받아야 할 돈.
- **산식**:
  ```
  미수금 = Σ payments.receivable_amount
          WHERE payment_status IN ('receivable','partial')
            AND deleted_at IS NULL
  -- receivable_amount = payments.amount − payments.paid_amount
  ```
- **데이터소스**: `payments.receivable_amount`, `.amount`, `.paid_amount`, `.payment_status`(CANON §3.10: receivable/partial), `.member_id`.
- **기준 구분**: 공통(채권). 결제기준 매출 인식 정책(`revenue_recognition`)에 따라 미수금은 매출에서 빠지거나 별도 표시(CANON §4.1, §6.3).
- **주의·해석 팁**: 회원별 드릴다운으로 **"누가 얼마 밀렸는지"** 추적. `receivable` 태그(CANON §3.17)·미수금 알림(`notification_type='receivable'`)과 연동. 미수금이 크면 결제기준 매출은 좋아 보여도 현금이 부족하다.

---

## 5. 월말 예측 지표 (Month-End Forecast)

> "이대로 가면 이번 달 끝에 얼마 남을까?" 를 월 중순에 미리 보여주는 지표군. 방법론 상세는 **§9 월말 예측 방법론** 참조. 모든 예측치는 **"예상" 배지 + 신뢰구간(낙관/보수)** 와 함께 표시한다.

### 5.1 예상지출 (projected_expense)

- **한 줄 설명**: 이번 달 말까지 추가로 나갈 것으로 보이는 비용을 더한, 월 전체 예상 비용.
- **산식**:
  ```
  예상지출 = 이미 발생한 비용(MTD)
           + 미발생 반복 고정비(is_recurring=true 이면서 이번 달 미집행분)
           + 변동비 일할 추정(아래 §9.2)

  변동비 추정 = (변동비 MTD ÷ 경과일수) × 당월 총일수
  ```
- **데이터소스**: `expense_records.amount`, `.expense_date`, `.cost_type`, `.is_recurring`(반복 고정비 식별).
- **기준 구분**: 공통.
- **주의·해석 팁**: 반복 비용은 **`is_recurring=true`의 과거 평균**으로 미집행분을 보충해 과소추정을 막는다. 임대료처럼 날짜 고정 비용은 캘린더로 확정 반영.

### 5.2 월말 예상 매출 (projected_revenue)

- **한 줄 설명**: 이번 달 말까지 들어올(또는 소진될) 것으로 보이는 총매출 예상.
- **산식**:
  ```
  결제기준 월말예상매출 = 순매출_MTD(payment)
                       + (순매출_MTD ÷ 경과영업일) × 잔여영업일      -- 런레이트
                       + 확정 예약된 선결제/재등록 파이프라인 보정(선택)

  소진기준 월말예상매출 = 순매출_MTD(consumption)
                       + 잔여기간 예약 확정분(reservations.booked, start_at∈잔여기간)
                         × 평균 unit_price_amount
  ```
- **데이터소스**: `revenue_records.amount`(MTD, 기준별), 소진 예측 시 `reservations`(status='booked')·`class_sessions.start_at`·`passes.unit_price_amount`.
- **기준 구분**: **둘 다**(소진기준은 **예약 확정분**이라는 더 정밀한 입력을 쓸 수 있어 결제기준보다 예측이 견고).
- **주의·해석 팁**: 소진기준 예측은 "이미 잡힌 예약"이라는 실데이터를 쓰므로 신뢰도가 높다. 결제기준은 단순 런레이트라 선결제 타이밍에 흔들린다 → **신뢰구간을 넓게**.

### 5.3 월말 예상 영업이익 (projected_operating_profit)

- **한 줄 설명**: 이번 달 끝에 남을 것으로 보이는 이익 예상.
- **산식**:
  ```
  월말 예상 영업이익 = 월말 예상 매출(5.2) − 예상지출(5.1)
  ```
- **데이터소스**: 5.2·5.1 산출값.
- **기준 구분**: **둘 다**(매출 기준에 따름).
- **주의·해석 팁**: 예측 오차가 누적되므로 **낙관/보수 두 시나리오**를 함께 제시. "이대로면 적자" 신호를 월 중순에 잡는 게 이 지표의 존재 이유.

### 5.4 월말 예상 현금잔고 (projected_cash_balance)

- **한 줄 설명**: 이번 달 말, 통장에 실제로 남아있을 현금 예상. **이익이 아니라 "통장에 찍힐 숫자"**.
- **산식**:
  ```
  월말 예상 현금잔고 = 현재 통장잔액(4.1)
                    + 미입금 카드매출(4.2) 중 월말까지 입금 예정분
                    + 잔여기간 예상 현금유입(결제기준 예상매출의 현금 회수분)
                    − 예상지출(5.1) 중 월말까지 실제 출금되는 분
  ```
- **데이터소스**: `bank_accounts.balance_amount`, `card_sales.net_deposit_amount`(stage≠deposited, 입금예정일 추정), `payments`(미수 회수 가정), `expense_records`(출금 예정).
- **기준 구분**: 공통(현금). **결제기준 사고에 더 가깝다**(현금 회수 타이밍이 핵심).
- **주의·해석 팁**: 영업이익(3.1)과 현금잔고는 **다르다**. 흑자인데 현금이 마르는("흑자도산") 상황을 미리 경고하는 지표. 미입금 카드매출·미수금·선결제 타이밍이 변수.

---

## 6. 수익성·단위경제 지표 (Profitability & Unit Economics)

> 이 영역은 **소진기준이 본질**이다. "어떤 수업·강사·유입경로가 진짜 돈이 되는가"는 실제 제공한 서비스(소진)로 따져야 정확하기 때문. 결제기준 분해는 상품 단위까지만 가능.

### 6.1 1:1 수익성 (personal_profitability)

- **한 줄 설명**: 1:1 개인레슨이 벌어주는 매출과, 거기 드는 강사료를 비교한 수익성.
- **산식**:
  ```
  1:1 소진매출 = Σ revenue_records.amount
                WHERE revenue_basis='consumption' AND class_type='personal'
                  AND recognized_date ∈ 기간
  1:1 강사료(원가) = Σ expense_records.amount (instructor_fee, 1:1 귀속분)
                   또는 Σ settlements 중 personal 세션 배분액
  1:1 수익성(공헌이익) = 1:1 소진매출 − 1:1 직접원가
  1:1 회차당 수익 = 1:1 수익성 ÷ 1:1 소진 회차 수
  ```
- **데이터소스**: `revenue_records`(basis='consumption', `class_type`='personal', `amount`) · `expense_records`(instructor_fee) · `attendance`/`pass_transactions`(회차 수).
- **기준 구분**: **소진기준 전용**(결제기준은 상품에 1:1/그룹 혼합 가능해 분해 부정확).
- **주의·해석 팁**: 1:1은 단가 높지만 강사 1인이 1명만 봐서 **회차당 강사 점유가 크다**. 그룹(6.2)과 **회차당 수익·강사 시간당 수익**으로 비교해야 의미 있다.

### 6.2 그룹 수익성 (group_profitability)

- **한 줄 설명**: 그룹레슨이 벌어주는 매출과 강사료를 비교한 수익성. 보통 1:1보다 강사 시간당 효율이 높다.
- **산식**:
  ```
  그룹 소진매출 = Σ revenue_records.amount
                WHERE revenue_basis='consumption' AND class_type='group'
  그룹 수익성 = 그룹 소진매출 − 그룹 직접원가(instructor_fee 그룹 귀속분)
  그룹 강사 시간당 수익 = 그룹 수익성 ÷ Σ class_sessions.duration_minutes(그룹) ÷ 60
  ```
- **데이터소스**: `revenue_records`(basis='consumption', `class_type`='group') · `expense_records`(instructor_fee) · `class_sessions.duration_minutes`, `.capacity`.
- **기준 구분**: **소진기준 전용**.
- **주의·해석 팁**: 그룹은 **정원 충족률**이 수익성을 좌우(`reservations` ÷ `class_sessions.capacity`). 빈자리 많은 그룹은 1:1보다 못할 수 있다 → 충족률을 함께 노출.

### 6.3 강사별 수익성 (instructor_profitability)

- **한 줄 설명**: 강사 한 명이 벌어주는 매출과, 그 강사에게 주는 강사료를 비교한 1인 손익.
- **산식**:
  ```
  강사 소진매출 = Σ revenue_records.amount
                WHERE revenue_basis='consumption'
                  AND instructor_staff_id = {강사}
                  AND recognized_date ∈ 기간
  강사료 = Σ expense_records.amount (instructor_fee, staff_id={강사})
          또는 settlements.total_amount(해당 강사·기간)
  강사 공헌이익 = 강사 소진매출 − 강사료
  강사 시간당 매출 = 강사 소진매출 ÷ Σ duration(해당 강사 세션) ÷ 60
  ```
- **데이터소스**: `revenue_records`(basis='consumption', `instructor_staff_id`) · `expense_records`/`settlements`(강사료) · `class_sessions`(`instructor_staff_id`, `duration_minutes`, `substitute_staff_id`).
- **기준 구분**: **소진기준 전용**.
- **주의·해석 팁**: 대체강사(`substitute_staff_id`) 세션은 **실제 진행한 강사**에 귀속해야 정확. 강사별 예약률/출석률/노쇼율/재등록 기여도(`_source-requirements.md` §12)와 함께 보면 정산·인사 의사결정 근거가 된다. **강사 본인은 자기 담당(`assigned`) 매출만** 조회(CANON §5).

### 6.4 유입경로별 수익성 (marketing_source_profitability)

- **한 줄 설명**: 어떤 경로로 온 회원이 돈을 더 많이 남기는가(네이버/인스타/지인소개/광고 등). 광고 예산 배분의 근거.
- **산식**:
  ```
  경로별 매출 = Σ revenue_records.amount
              WHERE marketing_source = {경로} AND revenue_basis = {기준}
  경로별 신규수 = COUNT(members) WHERE marketing_source={경로} AND 첫등록 ∈ 기간
  경로별 광고비 = Σ expense_records.amount(advertising, 해당 경로 귀속분)  -- is_paid 경로만
  경로별 수익성 = 경로별 매출 − 경로별 직접비용(광고비 등)
  경로별 ROAS = 경로별 매출 ÷ 경로별 광고비   (광고성 경로만, marketing_sources.is_paid=true)
  ```
- **데이터소스**: `revenue_records.marketing_source`, `.amount` · `members.marketing_source` · `marketing_sources.is_paid`(CANON §3.16) · `expense_records`(advertising) · `leads`(전환 추적).
- **기준 구분**: **둘 다 가능**(결제기준=등록 시점 매출 귀속, 소진기준=실제 사용 매출 귀속). 광고 의사결정엔 보통 **결제기준 + CAC/ROAS** 조합.
- **주의·해석 팁**: 무료 경로(`is_paid=false`)는 ROAS 산정 제외(분모 0). 유입경로별 **전환율(6.9)·CAC(6.5)** 와 묶어 "싸게 데려와 잘 남는 경로"를 찾는다.

### 6.5 1인당 평균매출 (arpu, revenue_per_member)

- **한 줄 설명**: 회원 한 명이 평균적으로 내주는 매출. "객단가"의 월 버전.
- **산식**:
  ```
  1인당 평균매출 = 순매출(1.3) ÷ 활성 회원 수
  활성 회원 수 = COUNT(DISTINCT members.id)
                WHERE member_status IN ('enrolled','re_enrolled')
                  AND (해당 기간 결제 또는 출석 1건 이상)
  ```
- **데이터소스**: `revenue_records.amount` · `members.member_status`(CANON §3.1) · `attendance`/`payments`(활성 판정).
- **기준 구분**: **둘 다**(분자 기준에 따름). 분모(활성 회원)는 동일.
- **주의·해석 팁**: 활성 회원의 정의(분모)를 화면에 명시. 1인당 평균매출이 떨어지면 → 저가 상품 비중↑ 또는 휴면↑. 1인당 평균이익(6.6)과 함께 본다.

### 6.6 1인당 평균이익 (profit_per_member)

- **한 줄 설명**: 회원 한 명당 실제로 남는 이익. 매출이 아니라 "남는 돈" 기준의 객단가.
- **산식**:
  ```
  1인당 평균이익 = 영업이익(3.1) ÷ 활성 회원 수(6.5와 동일 분모)
  ```
- **데이터소스**: 3.1 · 6.5 분모.
- **기준 구분**: **둘 다**(영업이익 기준에 따름).
- **주의·해석 팁**: LTV(6.7) 추정의 입력. 1인당 평균이익 × 평균 유지개월 ≈ 회원 1인 생애가치 감.

### 6.7 신규회원 CAC (cac, customer_acquisition_cost)

- **한 줄 설명**: 신규 회원 한 명을 데려오는 데 든 비용. "이 회원 한 명 모시는 데 얼마 썼나".
- **산식**:
  ```
  CAC = 신규 획득 비용 ÷ 신규 등록 회원 수
  신규 획득 비용 = Σ expense_records.amount(advertising)   -- 기본
                  (+ 선택: 체험 운영 직접비, 인포 인건비 배분)
  신규 등록 회원 수 = COUNT(members)
                    WHERE 최초 enrolled 전환 ∈ 기간
                      AND is_re_enroll = false
  ```
- **데이터소스**: `expense_records`(advertising, `expense_date`) · `members`/`leads`(최초 등록 전환, `enrolled_date`) · `revenue_records.is_new_member`.
- **기준 구분**: 공통(비용 기반 단위경제). LTV(6.8)와 함께 **LTV/CAC 배수**로 본다.
- **주의·해석 팁**: 분자에 무엇을 넣는지(광고비만 vs 광고비+인건비)를 **반드시 화면에 명시**. 유입경로별 CAC(6.4 연계)로 "경로별 효율" 비교. 일반적으로 **LTV ÷ CAC ≥ 3** 이면 건전.

### 6.8 회원 LTV (ltv, lifetime_value)

- **한 줄 설명**: 회원 한 명이 **떠날 때까지 우리 샵에 안겨주는 총가치**(매출 또는 이익 기준).
- **산식**:
  ```
  LTV(매출 기준) = 1인당 평균매출(월) × 평균 유지개월
  LTV(이익 기준, 권장) = 1인당 평균이익(월, 6.6) × 평균 유지개월

  평균 유지개월 = 1 ÷ 월 이탈률(churn)
  월 이탈률 = 해당 월 이탈(만료·휴면 전환) 회원 수 ÷ 직전 활성 회원 수
  -- 또는 코호트 생존곡선 기반(데이터 충분 시, §9.3)
  ```
- **데이터소스**: `revenue_records`/영업이익 · `members.member_status` 전이(`enrolled`→`expired`/`dormant`, CANON §3.1) · `passes.expire_date` · 코호트는 `purchases.purchased_at`.
- **기준 구분**: **둘 다 가능**(이익 기준 LTV 권장 — 진짜 남는 가치).
- **주의·해석 팁**: 신규 샵은 데이터가 적어 이탈률이 불안정 → 초기엔 **"매출 기준 LTV + 보수적 유지개월(예: 6개월 캡)"** 로 시작하고, 코호트가 쌓이면 생존곡선으로 고도화(§9.3). **LTV > CAC × 3** 을 목표선으로 표시.

---

## 7. CRM 전환 지표 (Conversion)

> 매출·비용과 직접 연결되는 "회원이 얼마나 잘 들어오고 남는가" 지표. 상담CRM(`leads`)·회원상태(`members`)에서 산출.

### 7.1 재등록률 (re_enroll_rate)

- **한 줄 설명**: 수강권이 끝난 회원 중 **다시 등록한 비율**. 샵 만족도·운영력의 핵심 척도.
- **산식**:
  ```
  재등록률 = 재등록 회원 수 ÷ 만료 도래 회원 수
  재등록 회원 수 = COUNT(members) WHERE member_status='re_enrolled' AND 전환 ∈ 기간
                 (교차검증: COUNT(revenue_records) WHERE is_re_enroll=true)
  만료 도래 회원 수 = COUNT(members)
                    WHERE passes.expire_date ∈ 기간 AND 직전 status='enrolled'
  ```
- **데이터소스**: `members.member_status`(CANON §3.1: `expired`/`re_enrolled`) · `passes.expire_date` · `revenue_records.is_re_enroll`.
- **기준 구분**: 공통(매출 기준과 무관, 인원 카운트).
- **주의·해석 팁**: 분모(만료 도래 모수) 정의를 명확히. 재등록률이 낮으면 → 신규 유치(광고비)에 의존하는 **밑 빠진 독** 구조. 만료임박 알림(`pass_expiring`)·재등록 알림(`re_enroll`)·`re_enroll_likely` 태그와 연동.

### 7.2 체험 등록전환율 (trial_conversion_rate)

- **한 줄 설명**: 체험수업을 해본 사람 중 **실제로 등록한 비율**. 체험→매출 전환의 핵심.
- **산식**:
  ```
  체험 등록전환율 = 체험 후 등록자 수 ÷ 체험 완료자 수
  체험 완료자 수 = COUNT(leads) WHERE trial_done_date ∈ 기간   (또는 lead_status='trial_done' 도달)
  체험 후 등록자 수 = COUNT(leads) WHERE enrolled_date 존재
                    AND trial_done_date 선행 AND enrolled_date ∈ 기간
  ```
- **데이터소스**: `leads.trial_done_date`, `.enrolled_date`, `.lead_status`(CANON §3.2: `trial_done`/`enrolled`) · `members.member_status`(`trial_done`→`enrolled`).
- **기준 구분**: 공통(인원 전환).
- **주의·해석 팁**: 유입경로별로 쪼개면(6.4 연계) "어느 경로가 체험까지는 오는데 등록을 안 하는가"가 드러난다. 전환율 낮은 경로는 광고비 효율(ROAS)도 나쁠 가능성. 체험 후 상담 알림(`trial_followup`)으로 개선.

### 7.3 (참고) 전환 퍼널 보조 지표

상담CRM 전체 퍼널은 [`03-scenarios.md`](./03-scenarios.md)·상담 화면이 소유하되, 본 지표 화면에서 함께 노출하는 보조 비율:

| 보조 지표 | 산식(코드) | 소스 |
|---|---|---|
| 문의→체험예약률 | `trial_booked` 도달 ÷ `new_inquiry` | `leads.lead_status` |
| 체험예약→체험완료율 | `trial_done` ÷ `trial_booked` | `leads.trial_booked_date`/`trial_done_date` |
| 문의→등록 전체전환율 | `enrolled` ÷ `new_inquiry` | `leads` 전 구간 |
| 상담 실패율 | `lost` ÷ 전체 종결 | `leads.lead_status='lost'`, `.lost_reason` |

---

## 8. 결제기준 vs 수업소진기준 — 종합 비교표

> CANON §4를 본 지표 관점에서 한 표로 정리. **대시보드 토글이 어떤 지표를 어떻게 바꾸는지**를 한눈에.

### 8.1 개념·인식 비교

| 항목 | 결제기준(`payment`) | 수업소진기준(`consumption`) |
|---|---|---|
| 원장님 한 줄 | **돈 들어온 날** 매출로 | **수업 쓴 날** 그만큼만 매출로 |
| 인식 시점 | `payments.paid_at` | `pass_transactions`(차감) 발생 시 |
| 1결제당 레코드 수 | 1건(+환불 음수) | 총횟수 N건(회차별) |
| 인식 금액 | `payments.paid_amount`(실수령) | `passes.unit_price_amount`(=실판매가÷총횟수) |
| 강사·수업유형 분해 | 불가(상품 단위) | **가능**(`class_type`,`instructor_staff_id`) |
| 미수금 처리 | 별도 표시(또는 미인식) | 미소진=자동 미인식 |
| 환불 반영 | `source_type='refund'` 음수 1건 | 미소진분 자동 제외 |
| 강점 | 현금흐름·자금관리 | 원가·수익성·정산 |
| 약점 | 선결제로 들쭉날쭉 | 현금 타이밍 안 보임 |

### 8.2 같은 사례, 두 기준 (워크스루)

> **사례**: 6월 10일, 회원 A가 **100만원짜리 20회 그룹권** 결제(실판매가=실수령 100만원). 단가 = 1,000,000 ÷ 20 = **50,000원/회**. 6월에 4회 출석(차감), 7월에 6회, 나머지는 이후.

| 시점 | 결제기준 매출 | 소진기준 매출 |
|---|---|---|
| 6월 | **1,000,000** (결제 1건) | 50,000 × 4 = **200,000** |
| 7월 | 0 | 50,000 × 6 = **300,000** |
| 이후 | 0 | 50,000 × 10 = 500,000 |
| 누계 | 1,000,000 | 1,000,000 |

- **해석**: 6월 대시보드는 토글에 따라 매출이 **100만원(결제기준)** 또는 **20만원(소진기준)** 으로 보인다. 둘 다 맞다. **절대 합쳐서 120만원으로 보지 않는다**(이중 합산 금지).
- **환불 사례**: 6월 20일 A가 환불 요청, 미사용 16회 환불(위약 공제 등 정책 적용은 [`16-payment-refund-policy.md`](./16-payment-refund-policy.md)). 결제기준은 `refund` 음수 레코드로 6월 매출 차감. 소진기준은 **이미 4회(20만원)만 인식**돼 있었으므로 미사용분은 애초에 매출에 없었다(자동 정합).

### 8.3 어떤 화면에서 어떤 기준을 쓰나 (권장)

| 화면·의사결정 | 권장 기준 | 이유 |
|---|---|---|
| 이번 달 자금/통장 관리 | 결제기준 | 현금 들어온 감각 |
| 강사료 정산·수업 원가 | 소진기준 | 실제 제공분 기준 |
| 1:1/그룹/강사/경로 수익성 | 소진기준 | 분해 가능 |
| 광고비 효율·CAC·ROAS | 결제기준 | 등록 시점 매출 귀속 |
| 월말 예상 현금잔고 | 결제기준(현금회수) | 통장 찍힐 숫자 |
| 월말 예상 매출/이익 | 둘 다 병기 | 비교 판단 |

---

## 9. 월말 예측 방법론 (Month-End Forecast Methodology)

> 5장 예측 지표(예상지출·월말 예상매출·이익·현금잔고)를 어떻게 계산하는지의 **정본 방법론**. 모든 예측은 "예상" 배지 + **보수/낙관 범위**로 표기하며, **확정 데이터(이미 발생·이미 예약된 것)를 최대한 쓰고, 모르는 부분만 추정**한다.

### 9.1 공통 변수 정의

```
오늘                = 스튜디오 타임존 기준 currentDate
당월_총일수          = 이번 달 달력 일수
경과일수            = 월초부터 오늘까지 일수
잔여일수            = 당월_총일수 − 경과일수
경과영업일/잔여영업일 = 영업일 캘린더 기준(주말·휴무 제외 권장)
MTD(Month-To-Date) = 월초~오늘 실제 발생 누계
런레이트(run-rate) = (MTD ÷ 경과(영업)일수) × 당월_총(영업)일수
```

### 9.2 비용 예측(예상지출, 5.1) — "확정 + 추정" 하이브리드

1. **확정분**: 이미 `expense_records`에 잡힌 MTD 비용은 그대로 사용.
2. **반복 고정비 미집행분**: `is_recurring=true`(임대료·관리비·인건비·통신비 등)이며 이번 달 아직 안 잡힌 항목 → **직전 3개월 동일 카테고리 평균**으로 보충(날짜 고정 비용은 캘린더 확정).
3. **변동비 추정**: 강사료·소모품·결제수수료 등은 **런레이트**(9.1)로 잔여분 추정. 강사료는 **잔여기간 예약 확정 세션 수 × 단가**로 더 정밀화 가능.
4. 합산: `예상지출 = 확정 MTD + 반복 고정비 미집행분 + 변동비 잔여 추정`.

> 권장: 강사료는 `settlements` 진행분 + 잔여 예약(`reservations.booked`) 기반으로, 결제수수료는 `card_fee_rate`로 별도 추정해 변동비 정확도를 높인다.

### 9.3 매출 예측(월말 예상매출, 5.2) — 기준별로 다른 입력

- **결제기준**: 기본 **런레이트**. 보정 입력으로 (a) 만료임박 회원의 재등록 기대치(`pass_expiring` 대상 × 과거 재등록률 7.1 × 평균 객단가), (b) 예약된 체험의 전환 기대치(체험완료 예정 수 × 전환율 7.2 × 객단가)를 더할 수 있다.
- **소진기준**: **잔여기간 예약 확정분**(`reservations.status='booked'` AND `class_sessions.start_at ∈ 잔여기간`) × 평균 `unit_price_amount`. 이미 잡힌 예약이라 **런레이트보다 견고**. 노쇼/취소율(과거 평균)로 할인 적용.
- **신뢰구간**: 보수(예약 확정분만) / 낙관(런레이트 + 파이프라인 보정). UI는 범위로 표기.

### 9.4 현금 예측(월말 예상 현금잔고, 5.4) — 이익이 아니라 "통장"

현금잔고는 **인식 매출이 아니라 실제 입출금 타이밍**으로 계산한다.

```
월말 예상 현금잔고
  = 현재 통장잔액(4.1)
  + 미입금 카드매출(4.2) 중 입금예정일 ≤ 월말 인 분    -- card_sales: approved/captured → deposited 전환 추정(영업일 +2~3)
  + 잔여기간 신규 결제 현금유입 추정                    -- 결제기준 예상매출 중 현금 회수분(미수 제외)
  + 미수금(4.3) 중 회수 예정분(보수적으로 0~일부)
  − 예상지출(5.1) 중 월말 이전 실제 출금분             -- 카드 청구일(billed_at)·이체일 반영
```

- **흑자도산 경보**: `월말 예상 영업이익(5.3) > 0` 이지만 `월말 예상 현금잔고(5.4) < 임계`면 경고 배지. 원인 드릴다운(미입금 카드매출↑/미수금↑/선결제 소진↑).

### 9.5 예측 정확도 관리

- **백테스트**: 매월 마감 시 `financial_reports`에 예측치 vs 실제치를 함께 적재 → 다음 달 예측 보정(편향 학습).
- **표기 원칙**: 모든 예측 숫자에 **"예상" 배지** + **계산 기준 일시**(예: "6/12 09:00 기준, 경과 7영업일") 표기. 확정 데이터 비중이 낮은 월초일수록 신뢰구간을 넓게.
- **데이터 부족(신규 샵)**: 과거 3개월이 없으면 런레이트 + 보수 캡(예: 유지개월 6개월 캡, LTV/CAC 미산정 처리)으로 시작하고, 코호트 누적 후 자동 전환.

---

## 10. 지표 카탈로그 요약 (한 눈에)

| # | 지표 | 코드명 | 영역 | 기준 | 핵심 소스 |
|---|---|---|---|---|---|
| 1.1 | 총매출 | `gross_revenue` | 매출 | 둘 다 | `revenue_records` |
| 1.2 | 환불액 | `refund_amount` | 매출 | 결제기준 고정 | `revenue_records`(refund, basis=payment)/`refunds` |
| 1.3 | 순매출 | `net_revenue` | 매출 | 둘 다 | `revenue_records` |
| 2.1 | 총비용 | `total_cost` | 비용 | 공통 | `expense_records` |
| 2.2 | 고정비 | `fixed_cost` | 비용 | 공통 | `expense_records`(fixed) |
| 2.3 | 변동비 | `variable_cost` | 비용 | 공통 | `expense_records`(variable) |
| 2.4 | 광고비 | `advertising_cost` | 비용 | 공통 | `expense_records`(advertising) |
| 2.5 | 강사료 | `instructor_fee` | 비용 | 공통 | `expense_records`/`settlements` |
| 2.6 | 카드수수료 | `card_fee` | 비용 | 공통 | `card_sales.fee_amount`/추정 |
| 3.1 | 영업이익 | `operating_profit` | 손익 | 둘 다 | 1.3 − 2.1 |
| 3.2 | 영업이익률 | `operating_profit_rate` | 손익 | 둘 다 | 3.1 ÷ 1.3 |
| 4.1 | 통장잔액 | `bank_balance` | 현금 | 공통 | `bank_accounts`/`bank_transactions` |
| 4.2 | 미입금 카드매출 | `undeposited_card_sales` | 현금 | 공통 | `card_sales`(stage≠deposited) |
| 4.3 | 미수금 | `receivable` | 채권 | 공통 | `payments.receivable_amount` |
| 5.1 | 예상지출 | `projected_expense` | 예측 | 공통 | `expense_records`+추정 |
| 5.2 | 월말 예상매출 | `projected_revenue` | 예측 | 둘 다 | `revenue_records`+예약 |
| 5.3 | 월말 예상영업이익 | `projected_operating_profit` | 예측 | 둘 다 | 5.2 − 5.1 |
| 5.4 | 월말 예상현금잔고 | `projected_cash_balance` | 예측 | 공통 | 4.1+4.2+회수−출금 |
| 6.1 | 1:1 수익성 | `personal_profitability` | 수익성 | 소진 | `revenue_records`(personal) |
| 6.2 | 그룹 수익성 | `group_profitability` | 수익성 | 소진 | `revenue_records`(group) |
| 6.3 | 강사별 수익성 | `instructor_profitability` | 수익성 | 소진 | `revenue_records`+`settlements` |
| 6.4 | 유입경로별 수익성 | `marketing_source_profitability` | 수익성 | 둘 다 | `revenue_records.marketing_source` |
| 6.5 | 1인당 평균매출 | `revenue_per_member` | 단위경제 | 둘 다 | 1.3 ÷ 활성회원 |
| 6.6 | 1인당 평균이익 | `profit_per_member` | 단위경제 | 둘 다 | 3.1 ÷ 활성회원 |
| 6.7 | 신규회원 CAC | `cac` | 단위경제 | 공통 | 광고비 ÷ 신규등록 |
| 6.8 | 회원 LTV | `ltv` | 단위경제 | 둘 다 | 1인당가치 × 유지개월 |
| 7.1 | 재등록률 | `re_enroll_rate` | 전환 | 공통 | `members`/`revenue_records.is_re_enroll` |
| 7.2 | 체험 등록전환율 | `trial_conversion_rate` | 전환 | 공통 | `leads.trial_done_date`/`enrolled_date` |

---

## 11. 권한·정합·구현 노트

- **권한(CANON §5, [`13-rbac.md`](./13-rbac.md))**: 매출·수익분석·현금·통장잔액 지표는 `owner`/`accountant` 전체, `manager` 요약(통장잔액 –), **`instructor`는 본인 `assigned` 매출만(전체 매출·통장잔액 불가)**, `member` 접근 불가. 수익분석 화면 진입·`export`는 `audit_logs`에 `action='export'`로 기록.
- **단일 출처(이중 합산 금지, §0.3)**: 매출=`revenue_records`만, 비용=`expense_records`만. 미매칭 통장/카드 거래는 "분류 대기"로만 노출.
- **인덱스 권장(CANON §1.1, [`11-erd.md`](./11-erd.md)가 확정 소유)**: `idx_revenue_records_basis_date(tenant_id, studio_id, revenue_basis, recognized_date)`, `idx_revenue_records_class_instructor(tenant_id, studio_id, revenue_basis, class_type, instructor_staff_id)`, `idx_expense_records_cat_date(tenant_id, studio_id, expense_category, expense_date)`, `idx_card_sales_stage(tenant_id, studio_id, reconciliation_stage)`, `idx_payments_status_recv(tenant_id, studio_id, payment_status)`.
- **표시 규약**: 모든 매출·이익 지표에 **기준 라벨**(결제/소진) 강제. 금액은 원 단위 정수, 만원 환산 옵션. 비율은 백분율 + "100원 중 ○원". 예측은 "예상" 배지 + 범위 + 기준 일시.
- **소프트 삭제·감사(CANON §1.2)**: 모든 집계 `deleted_at IS NULL`. 금액·환불·차감 변경은 물리 삭제 없이 `audit_logs` 기록.

---

## 관련 문서

- [`_source-requirements.md`](./_source-requirements.md) — 정본 소스(§8 수익분석 지표 · §13 4영역 · §18 UX 원칙)
- [`00-canon.md`](./00-canon.md) — 단일 진실원천(이중 손익 §4 · 엔티티 §2 · enum §3 · RBAC §5 · 정책 §6) — 본 문서 산식의 정의 근거
- [`09-admin-dashboard.md`](./09-admin-dashboard.md) — 관리자 대시보드(4영역) — 본 문서 산식을 위젯으로 표시
- [`10-profit-dashboard.md`](./10-profit-dashboard.md) — 수익분석 대시보드(이중 손익 토글·수익성 분해·드릴다운) — 본 문서 산식의 시각화 소유
- [`13-rbac.md`](./13-rbac.md) — 권한 정책(역할별 수익분석·통장잔액 접근 제한)
- [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) — 결제/환불/미수금 인식 기준(환불액·미수금 근거)
- [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) — 통장/카드 매칭·카드매출 입금 단계(미입금 카드매출·통장잔액 근거)
- [`18-expense-category-policy.md`](./18-expense-category-policy.md) — 비용 카테고리(17종)·고정비/변동비 분류(비용 지표 근거)
- [`11-erd.md`](./11-erd.md) — 테이블 상세 컬럼·인덱스·제약(지표 소스 스키마 확정 소유)
- [`03-scenarios.md`](./03-scenarios.md) — 상담CRM 퍼널·상태 전이(전환 지표 맥락)
