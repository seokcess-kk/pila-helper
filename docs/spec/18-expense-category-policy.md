# 18-expense-category-policy.md — 비용 카테고리 정책

> **목적**: 필라테스 샵의 모든 지출(통장 출금·사업자 카드 사용·수동 입력)을 **17개 기본 비용 카테고리**로 일관되게 분류하고, 각 카테고리를 **고정비/변동비**로 구분하며, 거래처명 기반 자동 매핑·규칙 학습·반복 비용 자동 등록·증빙 첨부 규칙을 한 곳에서 완결적으로 정의한다. 또한 **강사료·결제수수료처럼 수업/매출에 연동되는 비용**의 산정 산식을 명시한다. 모든 비용은 결국 [`10-profit-dashboard.md`](./10-profit-dashboard.md)·[`19-metrics.md`](./19-metrics.md)의 영업이익 계산으로 흘러가되, **부가세·소득세/법인세 등 영업이익 정의상 비용이 아닌 세금은 영업이익 산식에서 제외**한다(§3.2.1). 영업이익 산식의 SSOT는 [`19-metrics.md`](./19-metrics.md) §3.1이며 본 문서는 그 비용 입력을 동일 규칙으로 제공한다.

본 문서는 [`00-canon.md`](./00-canon.md)의 계약을 따른다. 테이블명·컬럼명·enum 값(`expense_category` 17종 §3.13, `cost_type` §3.14, `match_target` §3.19)·정책 기본값(§6.3)은 모두 canon에서 정의된 것을 **글자 단위로** 사용한다. 본 문서는 **비용 분류·산정의 적용 규칙**을 소유하되, enum·테이블·정책 기본값의 정의는 바꿀 수 없다. 거래 매칭의 메커니즘(통장/카드 매칭, 매칭 규칙 학습)은 [`17-reconciliation-policy.md`](./17-reconciliation-policy.md)와 짝을 이루며, 본 문서는 그중 **비용으로 분류된 거래의 카테고리·성격 결정 규칙**을 책임진다.

---

## 1. 범위와 핵심 원칙

### 1.1 이 문서가 다루는 것

- 17개 기본 비용 카테고리(`expense_category`) 각각의 **정의·예시·고정비/변동비 구분·수익분석 취급**
- 비용의 단일 인식 원장 `expense_records`로의 통합(통장/카드/수동)
- **반복 비용(정기 자동 등록)** 규칙
- 거래처명 기반 **자동 카테고리 매핑**과 **규칙 학습**(원본 §7·§18, [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) 연계)
- 증빙 파일 첨부·세금계산서/현금영수증/카드영수증 메모 규칙
- **카테고리 커스터마이즈**(샵별 추가/비활성/정렬) 정책
- **강사료·결제수수료** 등 수업/매출 연동 비용의 산정 방식과 정산(`settlements`)·매출(`revenue_records`) 연결

### 1.2 이 문서가 다루지 않는 것

- 통장/카드 거래의 입금 매칭·미매칭 큐·매칭 추천 알고리즘 → [`17-reconciliation-policy.md`](./17-reconciliation-policy.md)
- 매출 인식(결제기준/소진기준)과 환불 → [`16-payment-refund-policy.md`](./16-payment-refund-policy.md), canon §4
- 영업이익·이익률·1인당 이익 등 **지표 산식의 정의** → [`19-metrics.md`](./19-metrics.md)(본 문서는 비용 입력값만 책임)

### 1.3 관계되는 핵심 엔티티 (canon §2)

| 엔티티 | 본 정책에서의 역할 |
|---|---|
| `expense_records` | **비용 인식 원장**. ◆`expense_category`·◆`cost_type`·★`amount`·`source`(bank/card/manual)·`is_recurring`·`receipt_file_url`·`doc_memo` 보유 |
| `expense_categories` | 비용 카테고리 사전(17종 기본 + 샵 커스텀). `code`·`name_ko`·◆`default_cost_type`·`is_active`·`sort_order` |
| `transaction_matching_rules` | 거래처명 기반 자동 분류 규칙. `pattern`·`match_type`·◆`target_match`·◆`expense_category`·◆`cost_type`·`priority` |
| `transaction_reconciliation_logs` | 매칭/분류/재분류 이력(누가·무엇을·어떻게). 규칙 학습의 근거 |
| `bank_transactions` | 통장 출금 거래(`direction=withdraw`). `expense_records`의 `bank_transaction_id`로 연결 |
| `card_expenses` | 사업자 카드 사용(지출) 내역. `expense_record_id`로 분류 결과 연결 |
| `settlements` | 강사/직원 정산 집계. **강사료(`instructor_fee`)·인건비(`payroll`)** 비용의 산정 근거 |
| `revenue_records` | 매출 인식 원장. **결제수수료(`payment_fee`)** 산정의 베이스(카드매출액) |
| `card_sales` | 카드 매출 내역. ★`fee_amount`(카드수수료) 보유 → 결제수수료 비용의 근거 |
| `audit_logs` | **비용 생성/수정/삭제·재분류·규칙 변경 기록**(canon §1.2, §5 필수) |

### 1.4 불변 원칙 (Invariants)

1. **모든 지출은 단 하나의 `expense_records` 레코드로 귀속된다.** 출처가 통장이든 카드든 수동이든 최종 인식 원장은 `expense_records` 하나이며, `source`(bank/card/manual)와 출처 FK(`bank_transaction_id`/`card_expense_id`)로 추적한다. **이중 계상 금지**: 같은 거래가 통장과 카드에서 모두 잡히면 안 된다(§4.5 중복 방지).
2. **모든 `expense_records`는 정확히 하나의 `expense_category`와 하나의 `cost_type`을 가진다.** 미분류 상태는 임시값 `etc`(기타)가 아니라 **분류 대기 큐**(아래 §6.1)로 관리하고, 확정 전까지 손익에 포함할지는 정책(`include_unclassified_in_pl`, 기본 false)으로 결정한다.
3. **`cost_type`은 카테고리 기본값에서 시작하되, 레코드 단위로 오버라이드 가능하다.** 예: 통상 `payroll`은 `fixed`지만, 일용/대체 강사 인건비는 `variable`로 둘 수 있다(§3.2).
4. **카테고리 코드(`expense_category`)는 글자 단위로 canon §3.13을 따른다.** 샵 커스텀 카테고리는 기본 17종과 **코드가 겹치지 않는** 신규 코드로만 추가한다(§7).
5. **금액은 정수(원), 비용은 양수로 저장**한다(canon §1.3). 환급·취소는 별도 음수 조정 레코드 또는 `is_reversal` 플래그로 처리(§4.6).
6. **모든 비용 생성·수정·삭제·재분류·규칙 변경은 `audit_logs`에 남긴다**(canon §5). 카테고리/금액/cost_type 변경은 `before_json`/`after_json` 필수.
7. **거래처 분류 규칙은 미래 거래에만 적용된다.** "한 번 수정한 분류는 다음 거래부터 자동 적용"(원본 §18) — 과거 레코드 일괄 재분류는 명시적 관리자 액션(§6.4)으로만.

---

## 2. 비용의 흐름 (입력 → 분류 → 인식 → 손익)

```
[출처 3종]                         [분류]                       [인식 원장]              [손익]
 통장 출금(bank_transactions) ─┐
 카드 사용(card_expenses)     ─┼─▶ 자동 매핑(규칙) ─▶ 관리자 확인/수정 ─▶ expense_records ─▶ 영업이익
 수동 입력(manual)           ─┘     (transaction_matching_rules)   (재분류 시 규칙 학습)   (cost_type별 집계)
                                                                         │
                                                          반복 비용 스케줄러 ─┘ (is_recurring=true 자동 생성)
```

**한 줄 요약(원장 비전문가용)**: "통장에서 나간 돈, 카드로 쓴 돈, 손으로 적은 돈을 전부 한 장부(`expense_records`)에 모은다. 거래처 이름을 보고 자동으로 '임대료/강사료/광고비…' 같은 칸에 넣어주고, 잘못 들어가면 한 번 고치면 다음부터는 알아서 그 칸에 들어간다. 매달 똑같이 나가는 임대료 같은 건 자동으로 매달 적힌다."

### 2.1 `expense_records` 핵심 컬럼 매핑(요약)

| 컬럼 | 의미 | 본 문서에서의 규칙 |
|---|---|---|
| ◆`expense_category` | 17종 + 커스텀 | §3 카테고리 사전 |
| ◆`cost_type` | fixed/variable | §3 기본값 + 레코드 오버라이드(§1.4-3) |
| ★`amount` | 비용액(원, 양수) | 부가세 포함액 기준 저장(§5.3) |
| `vendor_name` | 거래처명 | 자동 매핑 키(§6) |
| `expense_date` | 비용 귀속일(KST `_date`) | 카드=사용일, 통장=출금일, 수동=입력 지정일 |
| `source` | bank/card/manual | 출처 추적 |
| `bank_transaction_id` | 통장 거래 FK | source=bank 시 |
| `card_expense_id` | 카드 사용 FK | source=card 시 |
| `is_recurring` | 반복 비용 여부 | §4 |
| `receipt_file_url` | 증빙 파일 | §5 |
| `doc_memo` | 세금계산서/영수증 메모 | §5.2 |
| `staff_id` | 귀속 강사(강사료 시) | §8.1 |

---

## 3. 17개 기본 비용 카테고리 사전

> 아래 표의 코드·라벨·`default_cost_type`은 **canon §3.13/§3.14를 글자 단위로** 옮긴 것이다. "수익분석 취급"은 [`09-admin-dashboard.md`](./09-admin-dashboard.md)·[`19-metrics.md`](./19-metrics.md)에서 어떻게 집계·표시되는지를 나타낸다.

### 3.1 카테고리별 정의·예시·구분(전체 17종)

| # | code | 라벨 | default `cost_type` | 한 줄 정의 | 대표 예시(거래처/항목) |
|---|---|---|---|---|---|
| 1 | `rent` | 임대료 | `fixed` | 샵 공간 월 임차료 | 건물주 계좌이체, 부동산 |
| 2 | `maintenance_fee` | 관리비 | `fixed` | 건물 공용 관리비 | 관리사무소, 위탁관리업체 |
| 3 | `payroll` | 인건비 | `fixed` | 정직원 급여·4대보험 사업주부담분 | 직원 급여이체, 국민연금/건강보험 |
| 4 | `instructor_fee` | 강사료 | `variable` | 수업 단위·매출 연동 강사 보수(프리랜서/시급/배분) | 강사 정산이체(§8.1) |
| 5 | `advertising` | 광고비 | `variable` | 신규 유입을 위한 마케팅 지출 | 네이버 검색광고, 메타(인스타) 광고, 인플루언서 |
| 6 | `payment_fee` | 결제수수료 | `variable` | 카드/PG 결제 수수료(매출 연동) | 카드사 가맹점 수수료, VAN/PG사(§8.2) |
| 7 | `supplies` | 소모품비 | `variable` | 운영 소모품·교체품 | 양말/밴드/링/롤러, 세탁세제, 비품 |
| 8 | `facility` | 시설관리비 | `variable` | 기구·시설 수리·점검 | 리포머 정비, 청소용역, 방역 |
| 9 | `utilities` | 공과금 | `variable` | 전기·수도·가스 | 한국전력, 수도사업소, 도시가스 |
| 10 | `telecom` | 통신비 | `fixed` | 인터넷·전화·CCTV 회선 | 통신사 약정요금 |
| 11 | `tax_accounting` | 세무기장료 | `fixed` | 세무사 월 기장 수수료 | 세무사무소 정기이체 |
| 12 | `education` | 교육비 | `variable` | 강사·직원 역량 교육·자격 | 필라테스 워크숍, 자격과정, 세미나 |
| 13 | `insurance` | 보험료 | `fixed` | 배상책임·화재보험 등 정기 보험 | 손해보험사 월납 |
| 14 | `tax` | 세금 | `variable` | 부가세·종합소득세·지방세 등 납부. **단, 부가세(매입/매출 상계 대상)와 소득세/법인세는 영업이익 비용에서 제외**(§3.2.1) | 홈택스, 위택스, 국세/지방세 |
| 15 | `meal` | 식대 | `variable` | 직원 식대·간식 | 식당, 배달앱, 카페 |
| 16 | `transport` | 교통비 | `variable` | 업무 이동·주차·유류 | 택시/대중교통, 주차장, 주유소 |
| 17 | `etc` | 기타 | `variable` | 위 16종에 속하지 않는 지출(분류 보류 포함) | 기타 잡비 |

### 3.2 카테고리별 수익분석 취급(고정비/변동비 의미 + 산식 연결)

> **원장(비전문가) 설명**: "고정비는 회원이 늘든 줄든 매달 거의 똑같이 나가는 돈(임대료·관리비·세무기장료처럼). 변동비는 매출이나 수업·회원 수에 따라 늘었다 줄었다 하는 돈(강사료·광고비·결제수수료처럼). 영업이익을 볼 때 고정비는 '버텨야 하는 기본 부담', 변동비는 '벌수록 같이 늘지만 매출에 비례하는 부담'으로 본다."

| code | 손익에서의 역할 | 대시보드 표시(④이번 달 비용) | 비고 |
|---|---|---|---|
| `rent` | 고정비 합산 | 임대료(별도 라인) | 손익분기 계산의 기준 |
| `maintenance_fee` | 고정비 합산 | 고정비 묶음 | |
| `payroll` | 고정비 합산 | 인건비 | 일용·대체분은 레코드 단위 `variable` 오버라이드 가능 |
| `instructor_fee` | **변동비, 매출 연동** | 강사료(별도 라인) | 수업/매출 비례(§8.1) → 강사별 수익성 산정 |
| `advertising` | **변동비, CAC 입력값** | 광고비(별도 라인) | 신규회원 CAC = 광고비 ÷ 신규회원 수([`19-metrics.md`](./19-metrics.md)) |
| `payment_fee` | **변동비, 매출 연동** | 결제수수료(별도 라인) | 카드매출 × 수수료율(§8.2) |
| `supplies` | 변동비 합산 | 소모품비(별도 라인) | |
| `facility` | 변동비 합산 | 변동비 묶음 | |
| `utilities` | 변동비 합산 | 공과금(별도 라인) | 계절성 큼 |
| `telecom` | 고정비 합산 | 고정비 묶음 | |
| `tax_accounting` | 고정비 합산 | 고정비 묶음 | |
| `education` | 변동비 합산 | 변동비 묶음 | |
| `insurance` | 고정비 합산 | 고정비 묶음 | |
| `tax` | **부가세·소득세/법인세는 영업이익 비용에서 제외**, 그 외 사업관련세(인지세·자동차세 등)만 변동비 합산 | 변동비 묶음(제외분은 미표시) | 영업이익 SSOT는 [`19-metrics.md`](./19-metrics.md) §3.1. 제외 규칙·이중계상 방지는 §3.2.1 |
| `meal` | 변동비 합산 | 변동비 묶음 | |
| `transport` | 변동비 합산 | 변동비 묶음 | |
| `etc` | 변동비 합산(기본) | 기타 | 분류 대기분이 여기로 임시 합류하지 않도록 §6.1 큐 사용 권장 |

**집계 산식(canon §4.4 준용, 비용 측 입력)**

> **영업이익용 총비용은 영업이익 비용에서 제외되는 세금(부가세·소득세/법인세, §3.2.1)을 빼고 집계**한다. 영업이익·영업이익률 산식의 SSOT는 [`19-metrics.md`](./19-metrics.md) §2.1·§3.1이며, 본 문서는 그 입력(비용)을 동일 규칙으로 제공한다.

```
-- 영업이익 비용에서 제외되는 세금 집합(§3.2.1):
-- expense_category='tax' AND tax_kind IN ('vat','income_tax','corporate_tax','local_tax')
EXCLUDED_TAX := expense_records
                WHERE expense_category='tax'
                  AND tax_kind IN ('vat','income_tax','corporate_tax','local_tax')

총비용  = Σ expense_records.amount  (기간 내, deleted_at IS NULL, 환급 음수 포함)
                                    AND NOT EXCLUDED_TAX        -- 영업이익용 총비용
고정비  = Σ expense_records.amount  WHERE cost_type = 'fixed'   AND NOT EXCLUDED_TAX
변동비  = Σ expense_records.amount  WHERE cost_type = 'variable' AND NOT EXCLUDED_TAX
광고비  = Σ expense_records.amount  WHERE expense_category = 'advertising'
강사료  = Σ expense_records.amount  WHERE expense_category = 'instructor_fee'
결제수수료 = Σ expense_records.amount WHERE expense_category = 'payment_fee'
영업이익 = 순매출 − 총비용                     (순매출은 canon §4.4, 선택 basis)
영업이익률 = 영업이익 ÷ 순매출
```

> **검증 불변식**: `총비용 = 고정비 + 변동비` (모든 레코드는 cost_type을 정확히 하나 가짐, 위 EXCLUDED_TAX 제외 후 동일 적용). 영업이익용 카테고리별 합의 총합 = 영업이익용 총비용(제외 세금 미포함).

#### 3.2.1 세금(`tax`)의 영업이익 취급 — 제외 규칙과 이중계상 방지 (SSOT 정합)

> 회계상 **영업이익(operating profit)은 법인세·소득세 차감 전 지표**이므로 종합소득세·법인세를 영업이익 비용에 넣으면 정의가 왜곡된다. 또한 **부가세(VAT)는 매입/매출 상계로 정산되는 거래세**이며, 본 문서 §5.3에서 `expense_records.amount`를 **부가세 포함 총액**으로 저장하므로, 부가세 납부분을 별도 비용으로 계상하면 **이중 차감**이 된다. 따라서 `tax` 카테고리는 아래 세분(`tax_kind`)으로 나눠 영업이익 포함 여부를 확정한다.

`tax` 레코드는 레코드 단위 보조 분류 `tax_kind`를 가진다(구현 컬럼/보조 필드는 [`11-erd.md`](./11-erd.md)가 본 사전 범위 내에서 상세화. 미지정 시 분류 대기 큐 §6.1, 영업이익 미포함이 기본).

| `tax_kind` | 예시 | 영업이익 비용 포함 | 근거 |
|---|---|---|---|
| `vat` | 부가가치세 납부(매출세액−매입세액) | **제외** | §5.3 부가세 포함 저장과 이중계상 방지. 부가세는 손익이 아닌 정산 항목 |
| `income_tax` | 종합소득세 | **제외** | 영업이익은 소득세 차감 전 지표(영업외/세금) |
| `corporate_tax` | 법인세 | **제외** | 영업이익은 법인세 차감 전 지표(영업외/세금) |
| `local_tax` | 지방소득세(소득할) | **제외**(income/corporate 종속) | 소득세·법인세에 부수하는 지방세 |
| `business_tax` | 인지세·자동차세·재산세 등 **사업관련 세금** | **포함**(변동비) | 영업비용 성격의 사업세는 영업이익 차감 대상 |

**규칙**

1. **영업이익 비용 제외**: `tax_kind IN ('vat','income_tax','corporate_tax','local_tax')`인 `tax` 레코드는 §3.2 집계 산식의 `총비용`·`고정비`·`변동비`에서 **제외**한다(영업이익·영업이익률에 영향 없음).
2. **부가세 이중계상 방지**(§5.3 연계): `expense_records.amount`가 부가세 포함 총액으로 저장되므로, 매입 거래의 매입세액은 이미 각 비용 카테고리 금액 안에 포함돼 영업이익에 반영된다. 따라서 **부가세 납부(`tax_kind='vat'`) 레코드를 영업이익 비용으로 다시 더하지 않는다**(이중 차감 금지). 부가세는 현금흐름·세무 리포트(`financial_reports`, `tax_export`)에서만 별도 추적한다.
3. **세전/세후 이익 표시**: 제외된 세금(소득세·법인세 등)은 영업이익이 아니라 **세전이익→세후이익 단계에서 별도 차감**한다(해당 단계 표시 소유는 [`19-metrics.md`](./19-metrics.md)·세무 리포트). 영업이익 라인에는 절대 섞지 않는다.
4. **사업관련세만 영업비용**: `tax_kind='business_tax'`(인지세·자동차세·재산세 등 영업활동 부수 세금)만 `cost_type='variable'`로 영업이익 비용(변동비)에 포함한다.
5. **현금흐름·통장 매칭은 전액 유지**: 위 제외는 **영업이익(손익) 집계에서만** 적용된다. 통장/카드 매칭·현금흐름·총지출(cash-out) 집계에서는 부가세·소득세 납부도 실제 출금이므로 `expense_records`에 정상 인식·매칭한다(§1.4-1, §4.5 이중계상 방지는 그대로).

> **원장(비전문가) 설명**: "부가세는 우리가 잠깐 맡았다가 나라에 내는 돈이라 '우리가 번 이익'을 따질 때는 빼고 본다(게다가 비용 금액에 이미 부가세가 붙어 있어서 또 빼면 두 번 빼는 셈이다). 소득세·법인세는 '이익이 난 뒤에 그 이익에 매기는 세금'이라 영업이익(세금 내기 전 이익)에는 안 넣는다. 다만 인지세·자동차세처럼 사업하면서 그냥 나가는 세금은 비용으로 넣는다."

### 3.3 대시보드 ④의 카테고리 → 라인 매핑(원본 §13-③/④ 정합)

원본 §13의 "이번 달 비용" 라인(총비용·고정비·변동비·광고비·강사료·결제수수료·임대료·소모품비·공과금·기타)은 아래로 산출한다.

| 대시보드 라인 | 산출 |
|---|---|
| 총비용 | Σ amount (영업이익용: 영업이익 비용 제외 세금 §3.2.1 차감) |
| 고정비 / 변동비 | cost_type별 합 (제외 세금 §3.2.1 미포함) |
| 광고비 | `advertising` 합 |
| 강사료 | `instructor_fee` 합 |
| 결제수수료 | `payment_fee` 합 |
| 임대료 | `rent` 합 |
| 소모품비 | `supplies` 합 |
| 공과금 | `utilities` 합 |
| 기타 | 위 명시 라인 외 나머지 카테고리 합(`maintenance_fee`+`payroll`+`facility`+`telecom`+`tax_accounting`+`education`+`insurance`+`meal`+`transport`+`etc` + `tax` 중 `tax_kind='business_tax'`(사업관련세)만 + 커스텀). **`tax` 중 부가세·소득세/법인세·지방소득세(§3.2.1 제외분)는 영업이익·기타 라인에서 제외**(현금흐름·세무 리포트에서만 추적) |

---

## 4. 반복 비용(정기 자동 등록) 규칙

> 원본 §7·§17(2차): "반복 비용 등록 / 반복 비용 자동 등록". 매달(또는 주기적으로) 동일하게 발생하는 고정성 지출을 **스케줄러가 자동으로 `expense_records`에 생성**한다.

### 4.1 반복 비용 정의 모델

반복 비용 자체는 별도 마스터 테이블을 새로 만들지 않고, **시드(seed) 비용 레코드 + 반복 메타**로 운용한다(canon 41테이블 범위 유지). 반복 메타는 `expense_records.is_recurring = true`와 함께 다음 정보를 `doc_memo`/내부 `policy_json`이 아닌 **반복 규칙 표현**으로 보관한다(구현은 [`11-erd.md`](./11-erd.md)가 컬럼/보조 테이블로 상세화하되 본 사전을 벗어나지 않는다).

| 반복 속성 | 값 예시 | 설명 |
|---|---|---|
| `recurrence_rule` | `FREQ=MONTHLY;BYMONTHDAY=25` | RRULE 형식(예약 템플릿과 동일 표기 관례) |
| `recurring_amount` | 1,500,000 | 정기 예상 금액(실제 금액과 다르면 매칭 시 보정) |
| `recurring_category` | `rent` | 자동 생성 시 적용 카테고리 |
| `recurring_cost_type` | `fixed` | 자동 생성 시 cost_type |
| `recurring_vendor_name` | 건물주명 | 거래처 |
| `auto_post` | true/false | true=자동 확정 인식, false=초안(검토 대기) |

### 4.2 자동 생성 규칙

1. 스케줄러는 매일 1회(스튜디오 타임존 기준) 도래한 반복 항목을 평가한다.
2. 도래 시 `expense_records`에 `is_recurring=true`, `source='manual'`(시스템 생성), `created_by=NULL`로 1건 생성한다.
3. `auto_post=false`면 **초안 상태**(손익 미반영, 분류 대기 큐 §6.1)로 두고, 관리자 확인 후 확정한다.
4. `auto_post=true`면 즉시 확정 인식하되, **실제 통장/카드 거래가 들어오면 매칭으로 대체·정정**한다(§4.3).
5. 자동 생성된 레코드는 `audit_logs`에 `action='create'`, actor=시스템으로 남긴다.

### 4.3 반복 자동 등록 ↔ 실제 거래 매칭(이중 계상 방지)

반복 비용은 "예상치 선반영"이므로, 같은 달 실제 통장 출금/카드 사용이 들어오면 **합산이 아니라 대체**해야 한다.

```
규칙: 같은 (category, 거래처, 회계월) 안에서
  - 반복 자동 레코드(is_recurring=true, source=manual)가 이미 있고
  - 실제 거래(source=bank/card)가 매칭되면
  → 자동 레코드를 실제 거래 레코드로 '정정 병합'한다.
     · 실제 금액으로 amount 갱신
     · source/출처 FK를 실제 거래로 교체
     · 차액은 audit_logs에 기록(before/after)
  → 자동 레코드를 그대로 두고 새 레코드를 또 만들지 않는다(이중 계상 금지, §1.4-1).
```

매칭이 끝까지 안 들어오면(예: 현금 지급) 자동 레코드를 그대로 확정 유지한다.

### 4.4 반복 비용 적용 가이드(카테고리별)

| 카테고리 | 반복 권장 | 권장 주기 | `auto_post` 권장 |
|---|---|---|---|
| `rent` | 강력 권장 | 매월 고정일 | true |
| `maintenance_fee` | 권장 | 매월 | false(금액 변동) |
| `payroll` | 권장 | 매월 급여일 | false(상여/공제 변동) |
| `telecom` | 권장 | 매월 | true |
| `tax_accounting` | 권장 | 매월 | true |
| `insurance` | 권장 | 월/연 | true |
| `instructor_fee` | 비권장 | 정산 기반(§8.1) | — |
| `payment_fee` | 비권장 | 매출 기반(§8.2) | — |
| `advertising`·`supplies`·`utilities`·`facility`·`education`·`tax`·`meal`·`transport`·`etc` | 비권장(불규칙) | — | — |

### 4.5 중복 방지(요약)

- 통장과 카드 모두에서 같은 지출이 잡히는 경우(예: 카드값이 통장에서 빠져나감) → **카드 사용 건만 비용으로 인식**하고, 통장의 카드대금 출금은 `match_target='transfer'`(내부 결제, 비용 아님)로 처리한다([`17-reconciliation-policy.md`](./17-reconciliation-policy.md) 카드대금 합산출금 규칙과 정합).
- 반복 자동 ↔ 실제 거래는 §4.3로 대체.

### 4.6 비용 취소·환급 처리

- 비용 환급·과오납 반환은 **원 레코드를 수정하지 않고** 음수 `amount`의 조정 레코드를 추가하거나 `is_reversal=true`로 표기한다(금전 데이터 불변, canon §1.2). 카테고리·cost_type은 원 레코드와 동일하게 맞춰 순비용이 정확히 상쇄되게 한다.

---

## 5. 증빙·세금계산서/현금영수증/카드영수증 메모

> 원본 §7: "비용 증빙 파일 첨부 · 세금계산서/현금영수증/카드영수증 메모". 세무 신고·매입세액 공제·감사 대응의 근거가 된다.

### 5.1 증빙 첨부

| 항목 | 규칙 |
|---|---|
| 파일 보관 | `expense_records.receipt_file_url`(객체스토리지 URL). 원본은 테넌트별 격리 버킷 |
| 권장 형식 | PDF/JPG/PNG, 1건당 다중 첨부는 대표 1개 URL + 보조는 doc_memo 참조 |
| 보존 기간 | 세무 보존의무에 맞춰 최소 5년(국세) 보관 권장. 소프트삭제 후에도 파일 유지 |
| 의무화 정책 | `require_receipt_categories`(기본: `instructor_fee`,`advertising`,`facility`,`education` 등 매입세액·정산 근거 필요 카테고리) — 해당 카테고리는 증빙 없으면 확정 시 경고 |

### 5.2 세금계산서/현금영수증/카드영수증 메모(`doc_memo`)

`doc_memo`에는 **증빙 종류 + 식별값**을 구조화 텍스트로 기록한다.

| 증빙 종류 | doc_memo 권장 포맷 예 | 매입세액 공제 |
|---|---|---|
| 세금계산서 | `tax_invoice:승인번호=2026...;공급가=1,000,000;세액=100,000` | 가능(적격증빙) |
| 현금영수증(지출증빙) | `cash_receipt:사업자지출증빙;승인=...;공급가/세액` | 가능 |
| 카드영수증(사업자카드) | `card_receipt:승인번호=...;카드끝4=1234` | 가능 |
| 간이영수증/없음 | `simple_receipt` / `no_receipt` | 불가(또는 제한) |

> **원장 설명**: "세금계산서·사업자 지출증빙용 현금영수증·사업자카드 영수증이 있으면 부가세(매입세액)를 돌려받을 수 있다. 그래서 비용을 적을 때 어떤 증빙인지 메모로 같이 남겨둬야 세무사한테 넘길 때 깔끔하다."

### 5.3 부가세(VAT) 취급

- `expense_records.amount`는 **부가세 포함 총지급액(원)**으로 저장한다(현금흐름·통장 매칭과 1:1 일치 보장).
- 매입세액 공제·공급가/세액 분해가 필요하면 `doc_memo`의 공급가/세액 또는 보조 필드로 보관하고, 세무 리포트(`financial_reports`, `tax_export`)에서 분해 집계한다. 손익(영업이익) 표시는 **부가세 포함 총액 기준**을 기본으로 하되, 세무용 내보내기에서 공급가 기준으로 별도 산출 가능.
- **부가세 납부의 이중계상 방지(§3.2.1 연계, 필수)**: 매입 비용은 위와 같이 부가세 포함 총액으로 저장되어 **매입세액이 이미 각 비용 카테고리 금액에 녹아 영업이익에 반영**된다. 따라서 분기/반기 **부가세 납부(매출세액−매입세액)** 거래를 `tax`(`tax_kind='vat'`)로 인식하더라도 **영업이익 비용에 다시 더하지 않는다**(이중 차감 금지). 해당 납부 레코드는 통장 출금으로서 현금흐름·총지출 집계에는 정상 포함되되, 영업이익 산식(§3.2, [`19-metrics.md`](./19-metrics.md) §3.1)에서만 제외된다.

---

## 6. 거래처명 기반 자동 매핑과 규칙 학습

> 원본 §7·§18: "거래처명 기반 자동 카테고리 매핑 · **관리자가 수정한 분류 규칙을 다음 거래부터 자동 적용** · 한 번 수정한 거래처 분류는 다음 거래부터 자동 적용". 매칭 메커니즘 전반은 [`17-reconciliation-policy.md`](./17-reconciliation-policy.md)가 소유하며, 본 절은 **비용 카테고리/ cost_type 결정 규칙**에 집중한다.

### 6.1 분류 상태(라이프사이클)

```
신규 거래 유입(bank_transactions / card_expenses)
   │
   ├─ 규칙 매칭 성공 → 자동 분류(expense_category + cost_type 채움, is_matched=true)
   │                    → 관리자는 사후 검토/수정 가능
   │
   └─ 규칙 매칭 실패 → 분류 대기 큐(미분류)  ── 관리자 수동 분류
                                              └─(원하면) 규칙으로 저장 → 다음부터 자동
```

- **분류 대기 큐**: `expense_records`가 아직 카테고리 미확정인 거래(또는 `etc`로 임시 보류된 거래). 정책 `include_unclassified_in_pl`(기본 false)에 따라 손익 포함 여부 결정.
- "기타(`etc`)"는 **진짜 기타 지출**에 쓰고, "분류 못 한 것"의 임시 보관소로 남발하지 않는다(§1.4-2).

### 6.2 자동 매핑 규칙(`transaction_matching_rules`)

규칙 1건은 "거래처명 패턴 → (match_target, expense_category, cost_type)"의 매핑이다.

| 규칙 필드 | 의미 | 비용 분류에서의 사용 |
|---|---|---|
| `match_field` | counterparty_name(통장)/vendor_name(카드) | 어느 이름으로 매칭할지 |
| `pattern` | 문자열/정규식 | 거래처 패턴 |
| `match_type` | exact / contains / regex | 매칭 방식 |
| ◆`target_match` | revenue/expense/transfer/etc | **expense**일 때만 카테고리 적용 |
| ◆`expense_category` | 17종+커스텀 | 자동 적용 카테고리 |
| ◆`cost_type` | fixed/variable | 자동 적용 성격(미지정 시 카테고리 기본값) |
| `priority` | 정수(작을수록 우선) | 충돌 시 해소(§6.3) |
| `is_active` | 활성 | 비활성 규칙은 평가 제외 |

**규칙 예시**

| pattern | match_type | target_match | expense_category | cost_type | 결과 |
|---|---|---|---|---|---|
| `(주)한국전력` | contains | `expense` | `utilities` | `variable` | 한전 출금 → 공과금 |
| `네이버` + `광고` | regex `네이버.*광고` | `expense` | `advertising` | `variable` | 네이버 검색광고 → 광고비 |
| `홍길동세무사` | contains | `expense` | `tax_accounting` | `fixed` | 세무사 이체 → 세무기장료 |
| `OOO카드` | contains | `transfer` | — | — | 카드대금 출금 → 이체(비용 아님, §4.5) |
| `김강사` | exact | `expense` | `instructor_fee` | `variable` | 강사 정산이체 → 강사료(단, §8.1 정산 연동 우선) |

### 6.3 규칙 충돌 해소

1. `is_active=true` 규칙만 평가.
2. 매칭되는 규칙이 복수면 **`priority` 오름차순(작은 값 우선)** → 그래도 동률이면 더 **구체적인 매칭**(exact > contains > regex 순) → 그래도 동률이면 최근 생성 규칙 우선.
3. 어떤 규칙도 매칭 안 되면 분류 대기 큐(§6.1).
4. 적용된 규칙·결과는 `transaction_reconciliation_logs`(action=`auto_matched`, `rule_id` 기록)에 남긴다.

### 6.4 규칙 학습("한 번 고치면 다음부터 자동")

관리자가 어떤 거래의 분류를 수동으로 바꾸면(재분류), 시스템은 **그 거래처에 대한 규칙 생성/갱신을 제안**한다.

```
관리자가 거래 X(거래처='필라매트상사')를 supplies(소모품비)로 재분류
   → transaction_reconciliation_logs(action='reclassified', before/after) 기록
   → 규칙 제안: { match_field, pattern='필라매트상사', match_type='contains',
                  target_match='expense', expense_category='supplies', cost_type='variable' }
   → 관리자가 "이 거래처는 항상 이렇게" 동의 → transaction_matching_rules 저장(또는 갱신)
   → [핵심] 이 규칙은 '다음 거래부터' 자동 적용. 과거 레코드는 건드리지 않음(§1.4-7).
```

- **과거 소급 적용**은 기본 비활성. 관리자가 명시적으로 "과거 N건에도 적용"을 누르면 대상 레코드를 일괄 재분류하되 각 건을 `audit_logs`·`transaction_reconciliation_logs`에 남긴다.
- 규칙 갱신(기존 규칙의 카테고리 변경)은 미래 거래에만 영향. 이미 인식된 레코드는 불변.
- 규칙 학습의 상세(추천 점수·중복 규칙 병합)는 [`17-reconciliation-policy.md`](./17-reconciliation-policy.md)와 공유.

### 6.5 자동 분류 정확도 가드레일

- 신규 규칙은 **첫 적용 시 1회 관리자 확인**을 요구하도록 `require_first_confirm`(기본 true) 설정 가능 → 오학습 방지.
- 금액이 비정상적으로 큰 거래(임계 `large_expense_threshold`, 예 1,000,000원 초과)는 자동 확정 대신 검토 대기로 보낼 수 있다.

---

## 7. 카테고리 커스터마이즈(샵별 추가) 정책

> 원본 §7 기본 17종은 모든 샵 공통이지만, 샵마다 추가 항목이 필요할 수 있다(예: 음악 저작권료, 정수기 렌탈). `expense_categories` 테이블이 코드+데이터 혼합으로 이를 지원한다.

### 7.1 규칙

| 항목 | 규칙 |
|---|---|
| 기본 17종 | canon §3.13 코드. **삭제 불가**, `is_active=false`로 숨김만 가능(이미 인식된 레코드 보존) |
| 커스텀 추가 | 신규 `code`(snake_case, 기본 17종과 중복 금지) + `name_ko` + `default_cost_type`(fixed/variable) + `sort_order` |
| 커스텀 코드 네이밍 | 충돌 회피 위해 접두 권장: `custom_<name>` (예: `custom_music_license`) |
| 테넌트/스튜디오 범위 | 커스텀 카테고리는 해당 `tenant_id`/`studio_id` 범위에서만 노출(글로벌 오염 금지) |
| cost_type 기본값 | 추가 시 반드시 fixed/variable 중 하나 지정(NULL 불가) |
| 정렬 | `sort_order`로 대시보드/드롭다운 순서 제어. 기본 17종 → 커스텀 순 |
| 매핑 규칙 연동 | 커스텀 카테고리도 `transaction_matching_rules`의 `expense_category` 값으로 사용 가능 |
| 비활성화 영향 | 비활성 카테고리는 **신규 분류 선택지에서 제외**되나, 과거 레코드/집계는 그대로 유지 |

### 7.2 대시보드 영향

- 커스텀 카테고리는 대시보드 ④의 명시 라인(임대료·강사료·광고비·결제수수료·소모품비·공과금)에는 들어가지 않고, **`cost_type`에 따라 고정비/변동비 묶음과 "기타"** 로 합산된다(§3.3).
- 별도 라인으로 보고 싶으면 [`19-metrics.md`](./19-metrics.md) 커스텀 지표로 노출.

### 7.3 커스텀 추가 예시

| code | name_ko | default_cost_type | 비고 |
|---|---|---|---|
| `custom_music_license` | 음악저작권료 | `fixed` | 매장 음악 저작권(월정액) |
| `custom_water_rental` | 정수기렌탈 | `fixed` | 정수기/공기청정기 렌탈 |
| `custom_laundry` | 세탁용역 | `variable` | 수건 위탁세탁 |

---

## 8. 수업/매출 연동 비용의 산정 방식

> 원본 §6/§7/§12: 강사료·결제수수료는 다른 비용과 달리 **수업 소진 또는 매출에 비례**한다. 따라서 단순 입력이 아니라 **정산(`settlements`)·매출(`revenue_records`/`card_sales`)과 연동된 산식**으로 산정한다. 이 두 비용이 정확해야 1:1/그룹/강사별 수익성([`19-metrics.md`](./19-metrics.md))이 맞는다.

### 8.1 강사료(`instructor_fee`) 산정

강사료는 `settlements`(강사 정산 집계)에서 산정되어 `expense_records`(category=`instructor_fee`, source 통상 manual/bank)로 인식된다. **출석 기준 수업 수**(원본 §12)와 정산 방식에 따른다.

#### 8.1.1 출석 기준 수업 수

```
session_count(정산용) = COUNT(attendance) WHERE
   instructor_staff_id = 강사
   AND attendance_status IN ('attended','late')   -- 실제 진행된 수업
   AND class_session.start_at ∈ [period_start, period_end]
```
> 노쇼(`no_show`)·결석(`absent`)·사유결석(`excused`)을 정산 수업 수에 포함할지는 스튜디오 정책(`settlement_count_basis`, 기본: 진행된 수업만). 폐강(`canceled` 세션)은 제외.

#### 8.1.2 정산 방식(`settlement_method`)별 산식

| 방식 | 산식 | 예시 |
|---|---|---|
| 회당 고정(per_session) | `base_amount = session_count × rate_per_session` | 출석 40회 × 25,000 = 1,000,000 |
| 수업유형 차등(per_type) | `Σ(type별 session_count × type별 rate)` | 1:1 30회×35,000 + 그룹 50회×12,000 |
| 매출 배분(revenue_share) | `base_amount = 연동매출 × share_rate` | 소진기준 강사매출 6,000,000 × 50% = 3,000,000 |
| 시급(hourly) | `Σ(수업시간_h × hourly_rate)` | 60h × 30,000 = 1,800,000 |
| 고정급(fixed_salary) | 월 정액(이 경우 `payroll`로 처리 권장) | — |

**총정산액 산식(`settlements`)**
```
total_amount = base_amount + bonus_amount − deduction_amount
```
- `bonus_amount`: 재등록 기여·신규 전환 인센티브(원본 §12 재등록 기여도).
- `deduction_amount`: 가불·공제.

#### 8.1.3 매출 배분(revenue_share)의 연동매출 정의

revenue_share 방식은 **소진기준 매출**(canon §4.2, `revenue_basis='consumption'`)을 베이스로 하는 것을 기본으로 한다(실제 진행된 수업만큼만 강사료 발생 → 수익성 정합).

```
강사 연동매출 = Σ revenue_records.amount
   WHERE revenue_basis='consumption'
     AND instructor_staff_id = 강사
     AND recognized_date ∈ [period_start, period_end]
강사료(revenue_share) = round(강사 연동매출 × share_rate)
```
> 결제기준으로 배분하면 미소진분까지 강사료가 선지급되어 환불 시 정산 꼬임 → **소진기준 권장**.

#### 8.1.4 정산 → 비용 인식 연결

```
settlements.status: draft → confirmed → paid
confirmed 시: expense_records 1건 생성
   expense_category='instructor_fee', cost_type='variable',
   amount=settlements.total_amount, staff_id=강사,
   expense_date=정산 지급일(또는 기간 말일), source='manual'(지급 시 bank 매칭)
paid 시: 통장 출금(bank_transactions)과 매칭 → source/FK 갱신(이중 계상 금지 §4.5)
```
- 강사별 수익성 = (해당 강사 소진기준 매출) − (해당 강사 강사료) [− 배분 가능한 변동비]. 상세는 [`19-metrics.md`](./19-metrics.md).

### 8.2 결제수수료(`payment_fee`) 산정

카드/PG 결제에는 가맹점 수수료가 따른다. 매출(카드결제액)에 비례하는 **변동비**다.

#### 8.2.1 추정 vs 실측

| 단계 | 방법 | 산식 |
|---|---|---|
| MVP(추정) | 결제 시점에 수수료율로 추정 | `예상수수료 = card 매출액 × card_fee_rate`(canon §6.3 기본 0.023) |
| 2~3차(실측) | 카드사 입금내역에서 실수수료 확정 | `fee_amount = card_sales.amount − card_sales.net_deposit_amount` |

```
card_sales.net_deposit_amount = card_sales.amount − card_sales.fee_amount
결제수수료(월) = Σ card_sales.fee_amount  (입금=deposited 단계, 실측)
              또는 Σ (card_onsite 결제액 × card_fee_rate)  (추정, 미입금분)
```

#### 8.2.2 인식 규칙

- 결제수수료는 **매출액에서 차감되는 형태**(실수령=매출−수수료)이자 **비용**으로도 본다. 본 솔루션은 매출은 총액(canon §4.1 `paid_amount` 실수령 기준) 인식과 함께, **수수료를 별도 비용(`payment_fee`)으로 명시 계상**하여 대시보드 ④에 표시한다.
- 카드매출 입금([`17-reconciliation-policy.md`](./17-reconciliation-policy.md) `reconciliation_stage=deposited`) 확정 시 실수수료로 `expense_records`(category=`payment_fee`, cost_type=`variable`, source 통상 card_sale 연동)를 정산한다.
- 미입금 카드매출(`reconciliation_stage != deposited`)은 추정 수수료로 **예상 비용**에 반영(월말 예상 손익, [`19-metrics.md`](./19-metrics.md)).

#### 8.2.3 결제수수료 예시

```
이번 달 카드매출 합 = 10,000,000원, card_fee_rate = 0.023
예상 결제수수료 = 10,000,000 × 0.023 = 230,000원   (추정)
실제 입금 확정분 수수료 합 = Σ card_sales.fee_amount = 218,500원  (실측, 대체)
```

### 8.3 인건비(`payroll`) vs 강사료(`instructor_fee`) 구분

| 구분 | payroll(인건비) | instructor_fee(강사료) |
|---|---|---|
| 대상 | 정직원 급여·4대보험 사업주부담 | 프리랜서/시급/배분 강사 보수 |
| cost_type | fixed(기본) | variable |
| 산정 | 월 정액 | 수업/매출 연동(§8.1) |
| 정산 연동 | 보통 고정(반복 §4 가능) | `settlements` 연동 |
| 수익성 분해 | 전체 고정비로만 | 강사별 수익성에 직접 귀속(`staff_id`) |

> 정직원이지만 수업 비례 인센티브가 섞인 경우: 기본급은 `payroll`, 수업 비례분은 `instructor_fee`로 **분리 인식**해 수익성 정합을 유지한다.

---

## 9. 카테고리 결정 우선순위(종합 의사결정 규칙)

새 비용 1건의 카테고리·cost_type을 정할 때 다음 순서로 결정한다.

```
1) 정산/매출 연동 비용인가?
   - settlements 확정 강사 지급      → instructor_fee / variable (§8.1)
   - 카드매출 수수료                  → payment_fee / variable (§8.2)
2) 반복 자동 등록 항목과 매칭되는가? → 반복 메타의 category/cost_type, 정정 병합(§4.3)
3) 활성 매칭 규칙에 걸리는가?        → 규칙의 expense_category/cost_type (§6.2~6.3)
4) 관리자가 수동 지정              → 선택한 category, cost_type(기본값 또는 오버라이드)
5) 어느 것도 아니면                → 분류 대기 큐(미분류), 손익 포함은 정책에 따름(§6.1)
```

- cost_type은 (지정값) > (카테고리 default_cost_type)(canon §3.13) 순으로 결정.
- 모든 결정·변경은 `audit_logs` + (자동분류 시) `transaction_reconciliation_logs`.

---

## 10. 예시 시나리오(엔드투엔드)

### 10.1 임대료(반복·고정비)

```
설정: rent / fixed / 매월 25일 / 1,500,000 / auto_post=true
6/25 스케줄러: expense_records 자동 생성(is_recurring=true, source=manual, amount=1,500,000)
6/26 통장 CSV 업로드: '건물주' 출금 1,500,000 → 반복 레코드와 매칭 → 정정 병합(source=bank로 교체)
손익: 고정비 +1,500,000, 임대료 라인 +1,500,000
```

### 10.2 네이버 광고(변동비·CAC 입력)

```
카드 사용내역 CSV: vendor='네이버광고' 350,000
규칙 매칭: 네이버.*광고 → advertising / variable (auto)
관리자 확인 OK → 확정
손익: 변동비 +350,000, 광고비 라인 +350,000
지표: 신규회원 CAC = 광고비 ÷ 이달 신규회원 수 (19-metrics)
```

### 10.3 강사료(정산 연동·변동비)

```
정산기간 6/1~6/30, 강사 김OO, per_session 25,000, 출석기준 40회
base_amount = 40 × 25,000 = 1,000,000, bonus=재등록 인센티브 100,000
total_amount = 1,100,000 → settlements.confirmed
expense_records: instructor_fee / variable / amount=1,100,000 / staff_id=김OO
7/5 통장 출금 1,100,000 매칭 → source=bank
강사별 수익성: 김OO 소진기준 매출 − 1,100,000
```

### 10.4 결제수수료(매출 연동·실측 대체)

```
이달 카드매출 10,000,000, 추정수수료 230,000(0.023) → 월중 예상 비용 반영
월말 입금 대조 완료: Σ card_sales.fee_amount = 218,500
expense_records: payment_fee / variable / 218,500 (추정 230,000을 실측으로 대체)
```

### 10.5 미분류 거래 → 규칙 학습

```
통장 출금 '필라매트상사' 88,000 → 규칙 없음 → 분류 대기 큐
관리자: supplies(소모품비) / variable 로 수동 분류
시스템 제안: '필라매트상사' contains → supplies/variable 규칙 저장
다음 달 같은 거래처 출금 → 자동으로 supplies 분류(과거 건은 불변)
```

---

## 11. 정책 파라미터(스튜디오 설정, `studios.policy_json` 비용 영역)

> canon §6는 예약/수강권/결제/알림 기본값을 정의한다. 비용 영역 파라미터는 본 문서가 적용 규칙을 소유하며, 키는 아래로 표준화한다(구현 시 §6 형식과 동일하게 `policy_json` 하위에 둔다).

| 파라미터 | 키 | 기본값 | 설명 |
|---|---|---|---|
| 미분류 손익 포함 | `include_unclassified_in_pl` | false | 분류 대기 거래를 영업이익에 포함할지 |
| 증빙 필수 카테고리 | `require_receipt_categories` | `[instructor_fee, advertising, facility, education]` | 확정 시 증빙 없으면 경고 |
| 신규규칙 첫 적용 확인 | `require_first_confirm` | true | 오학습 방지 1회 확인 |
| 고액비용 검토 임계 | `large_expense_threshold` | 1,000,000 | 초과 시 자동확정 대신 검토 |
| 카드수수료율(추정) | `card_fee_rate` | 0.023 | canon §6.3 공유 키, 결제수수료 추정 |
| 강사료 정산 수업기준 | `settlement_count_basis` | `attended_only` | 정산 수업 수 산정 기준(§8.1.1) |
| 부가세 표시 기준 | `expense_amount_basis` | `vat_included` | 손익 표시 기본(총액) |
| 영업이익 비용 제외 세금 | `operating_profit_excluded_tax_kinds` | `[vat, income_tax, corporate_tax, local_tax]` | `tax` 중 영업이익 비용에서 제외할 `tax_kind`(§3.2.1). 나머지(`business_tax`)만 변동비 포함 |

---

## 12. 검증 규칙(QA 연동 — [`22-qa-checklist.md`](./22-qa-checklist.md))

- [ ] 모든 `expense_records`는 `expense_category` 1개 + `cost_type` 1개를 가진다(NULL 금지).
- [ ] `총비용 = 고정비 + 변동비` (cost_type별 합의 항등).
- [ ] 카테고리별 합의 총합 = 총비용.
- [ ] 통장+카드 동일 지출의 **이중 계상이 없다**(카드 사용만 비용, 통장 카드대금은 transfer).
- [ ] 반복 자동 레코드는 실제 거래와 매칭 시 **합산이 아니라 대체(정정 병합)** 된다.
- [ ] `instructor_fee`는 `settlements.total_amount`와 일치한다(±라운딩).
- [ ] `payment_fee`(실측)는 `Σ card_sales.fee_amount`와 일치한다.
- [ ] 분류 규칙 변경은 **다음 거래부터** 적용된다(과거 불변, 명시적 소급만 예외).
- [ ] 모든 비용 생성/수정/삭제/재분류/규칙변경이 `audit_logs`에 기록된다.
- [ ] 커스텀 카테고리 코드는 기본 17종과 충돌하지 않는다.
- [ ] 비용 금액은 정수(원), 환급은 음수 조정 레코드로만 처리.
- [ ] `tax` 중 부가세(`vat`)·소득세(`income_tax`)·법인세(`corporate_tax`)·지방소득세(`local_tax`)는 **영업이익용 총비용·고정비·변동비에서 제외**된다(§3.2.1). 사업관련세(`business_tax`)만 변동비에 포함.
- [ ] 부가세 납부(`tax_kind='vat'`) 레코드가 영업이익 비용으로 **이중 계상되지 않는다**(매입세액은 §5.3 부가세 포함 저장으로 이미 반영). 현금흐름·총지출에는 정상 포함.
- [ ] 영업이익 산식의 비용 입력이 [`19-metrics.md`](./19-metrics.md) §2.1(총비용)·§3.1(영업이익) SSOT와 일치한다(제외 세금 동일 적용).

---

## 관련 문서

- [`00-canon.md`](./00-canon.md) — 단일 진실원천(`expense_category` §3.13, `cost_type` §3.14, `match_target` §3.19, 회계모델 §4, 정책 §6)
- [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) — 통장/카드 거래 매칭·규칙 학습 메커니즘(본 문서와 짝)
- [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) — 결제/환불·카드매출 단계(결제수수료 베이스)
- [`19-metrics.md`](./19-metrics.md) — 영업이익·고정/변동비·CAC·강사별/유형별 수익성 산식
- [`09-admin-dashboard.md`](./09-admin-dashboard.md) — 관리자 대시보드 ③이번 달 비용·④이번 달 수익
- [`10-profit-dashboard.md`](./10-profit-dashboard.md) — 수익분석 대시보드(결제기준/소진기준 토글)
- [`11-erd.md`](./11-erd.md) — `expense_records`·`expense_categories`·`settlements`·`card_sales` 상세 스키마
- [`13-rbac.md`](./13-rbac.md) — 비용/정산 권한(회계 담당자=CRUD, 강사=본인 정산 R)
- [`22-qa-checklist.md`](./22-qa-checklist.md) — 비용 분류·금액·이중계상 검증
