# 17-reconciliation-policy.md — 통장/카드 거래내역 매칭 정책

> **목적**: 사업자 통장 입출금·사업자 카드 사용·카드매출 입금 내역을 시스템 안으로 가져와(업로드/수동등록), **회원 결제·비용·내부이체로 자동·반자동 매칭**하고, **거래처명 기반 학습 규칙**으로 다음 거래부터 자동 분류하며, **카드매출 승인일→매입일→입금일 3단계 대사(reconciliation)** 와 **모든 매칭의 감사 추적**을 한 곳에서 완결적으로 정의한다. 이 매칭·자동분류는 본 솔루션의 **경영관리/수익분석 차별화의 핵심 데이터 파이프라인**이며, 여기서 정리된 거래가 [`19-metrics.md`](./19-metrics.md)의 매출·비용·현금흐름 지표로 흐른다.

본 문서는 [`00-canon.md`](./00-canon.md)의 계약을 따른다. 테이블명·컬럼명·enum 값은 모두 canon §2(엔티티 사전)·§3(enum 사전)·§6(정책 파라미터)에서 정의된 것을 **글자 단위로** 사용한다. 본 문서는 매칭·자동분류·3단계 대사의 **적용 규칙**을 소유하되, enum·테이블·정책 기본값의 정의는 바꿀 수 없다. 매칭이 가리키는 결제/환불 모델은 [`16-payment-refund-policy.md`](./16-payment-refund-policy.md), 비용 카테고리·자동분류 카테고리는 [`18-expense-category-policy.md`](./18-expense-category-policy.md)가 함께 소유한다.

---

## 1. 범위와 핵심 원칙

### 1.1 이 문서가 다루는 것

- **MVP**: 통장 거래내역 CSV 업로드 스키마(필드 매핑·중복제거 키), 카드 사용내역 CSV 업로드 스키마, **카드매출 입금내역 수동 등록**.
- 계좌이체 입금자명 ↔ 회원명 매칭, **금액·날짜 근접도 스코어링과 후보 랭킹** 자동 추천 매칭.
- **미매칭 큐 UX**와 관리자 분류(매출/비용/이체/기타 = `match_target`, canon §3.19).
- **`transaction_matching_rules` 학습 규칙**: 거래처명→카테고리/회원 매핑을 수정하면 다음 거래부터 자동 적용. 규칙 우선순위·충돌 해결.
- **카드매출 승인일·매입일·입금일 3단계 대사**(`reconciliation_stage`, canon §3.21)와 `transaction_reconciliation_logs` 이력.
- 2차/3차(오픈뱅킹·카드매출 통합조회·홈택스) 연동 대비 테이블 활용과 마이그레이션 경로.
- **데이터 정합성 불변식과 감사 추적**(canon §1, §5).

### 1.2 이 문서가 다루지 않는 것 (소유 분리)

| 주제 | 소유 문서 |
|---|---|
| 결제 상태(`payment_status`)·환불 규칙·미수금 정의 | [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) |
| 비용 카테고리 17종 정의·고정/변동비·반복비용 | [`18-expense-category-policy.md`](./18-expense-category-policy.md) |
| 매출 인식(결제/소진 이중기준) 산식·현금흐름 지표 | [`19-metrics.md`](./19-metrics.md), canon §4 |
| 테이블 상세 컬럼/인덱스/제약 | [`11-erd.md`](./11-erd.md), canon §2 |
| 거래 업로드/매칭 API 엔드포인트 | [`12-api.md`](./12-api.md) |
| 매칭 화면 권한 스코프 | [`13-rbac.md`](./13-rbac.md), canon §5 |

### 1.3 관계되는 핵심 엔티티 (canon §2)

| 엔티티 | 본 정책에서의 역할 |
|---|---|
| `bank_accounts` | 사업자 통장 계좌(MVP는 메타·잔액 스냅샷). ★`balance_amount`·`last_synced_at` 보유 |
| `bank_transactions` | 통장 입출금 1건. ★`amount`·`direction`·`counterparty_name`·◆`match_target`·`matched_ref_type/id`·◆`reconciliation_stage`·`is_matched`·`import_batch_id` 보유 |
| `card_sales` | 카드 **매출** 1건(승인/매입/입금 3단계). `approved_at`·`captured_at`·`deposited_at`·◆`reconciliation_stage`·★`fee_amount`·★`net_deposit_amount`·`bank_transaction_id` 보유 |
| `card_expenses` | 사업자 카드 **사용(지출)** 1건. `vendor_name`·★`amount`·◆`match_target`·`expense_record_id`·`is_matched`·`import_batch_id` 보유 |
| `payments` | 회원 결제. 통장 입금/카드매출과 매칭되는 대상. ◆`payment_status`·★`amount`·★`paid_amount`·`depositor_name`·`receivable_amount` 보유 |
| `expense_records` | 비용 인식 원장. `source`(bank/card/manual)·`bank_transaction_id`·`card_expense_id`로 거래에 연결 |
| `revenue_records` | 매출 인식 원장. 매칭된 입금이 결제기준 매출(canon §4.1)로 흐름 |
| `transaction_matching_rules` | 거래처명→대상/카테고리/회원 자동분류 규칙. `pattern`·`match_type`·`priority`·`is_active` 보유 |
| `transaction_reconciliation_logs` | 매칭/분류 처리 이력(누가·무엇을·어떻게). append-only |
| `external_integrations`·`sync_logs` | 2차/3차 오픈뱅킹·카드조회 연동 설정·동기화 이력 |
| `audit_logs` | 모든 매칭/분류 변경의 감사 기록(canon §1.2, §5 필수) |

### 1.4 불변 원칙 (Invariants)

1. **거래 레코드(원천)는 불변에 가깝게 보존한다.** `bank_transactions`·`card_sales`·`card_expenses`의 `amount`·`txn_date`·`counterparty_name` 등 **원천 필드는 사후 수정 금지**(업로드 시 확정). 바뀌는 것은 **분류·매칭 메타**(`match_target`·`matched_ref_*`·`reconciliation_stage`·`is_matched`)뿐이다. 물리 삭제 금지(소프트삭제 `deleted_at`, canon §1.2).
2. **한 거래는 1개의 비즈니스 대상에만 확정 매칭된다.** `bank_transactions.matched_ref_type/matched_ref_id`, `card_expenses.expense_record_id`, `card_sales.bank_transaction_id`는 **1:1 확정 링크**다. 부분 매칭·분할 매칭은 §4.6 절차로만 허용.
3. **금액은 정수(원), 시각은 _at(UTC), 날짜는 _date(KST).** 통장은 거래 발생 날짜를 `txn_date`(date)로, 카드매출의 승인/매입/입금은 각각 `approved_at`/`captured_at`/`deposited_at`(timestamptz)로 둔다(canon §1.3, §1.4).
4. **매칭은 추천이고 확정은 사람 또는 규칙이 한다.** 자동 추천은 스코어만 제시하고, **자동확정 임계 또는 학습 규칙 일치** 시에만 자동 확정한다(§5.4). 그 외는 미매칭 큐로 보낸다.
5. **모든 매칭/분류/해제/재분류는 두 곳에 기록한다.** 업무 이력은 `transaction_reconciliation_logs`(상세 before/after), 금전 감사는 `audit_logs`(canon §5 `action ∈ {match, update, ...}`). 둘은 보완 관계이며 둘 다 append-only.
6. **학습 규칙은 소급 적용하지 않는다(기본).** 규칙 수정·생성은 **다음 거래부터** 자동 적용된다(원본 요구 §7, §18). 기존 미매칭분에 대한 소급 일괄적용은 관리자의 명시적 "규칙 재적용" 액션으로만 수행(§6.5).
7. **이중 회계 정합**: 입금 매칭은 canon §4.1(결제기준)의 인식 시점에 영향을 줄 수 있다(`revenue_recognition=on_deposit`인 스튜디오). 비용 매칭은 `expense_records`로만 비용이 인식된다(원천 거래만으로는 비용 인식 안 됨).

---

## 2. 데이터 인입 경로 개요 (Ingestion)

세 가지 원천이 각각의 테이블로 들어오고, 매칭·분류를 거쳐 **결제(매출)** 또는 **비용** 또는 **이체/기타**로 귀결된다.

```
[통장 거래내역 CSV] ─업로드─▶ bank_transactions ─매칭─▶ payments(매출) | expense_records(비용) | transfer | etc
[카드 사용내역 CSV] ─업로드─▶ card_expenses     ─분류─▶ expense_records(비용)
[카드매출 입금]     ─수동등록─▶ card_sales        ─3단계대사─▶ bank_transactions(입금) 와 대사
        (2차 오픈뱅킹/카드조회 시 위 3개 인입이 sync_logs 기반 자동 동기화로 대체)
```

- **MVP 인입**: CSV 업로드(통장·카드사용) + 카드매출 입금내역 수동 등록.
- **2차 인입**: `external_integrations`(open_banking/card_lookup) + `sync_logs`로 자동 동기화. **인입 경로만 바뀌고 매칭·분류·대사 로직은 동일**(§9).
- 모든 인입은 `import_batch_id`(업로드/동기화 1회 묶음 식별자)를 부여해 **배치 단위 추적·롤백·중복검사**를 가능하게 한다.

---

## 3. CSV 업로드 스키마 (MVP)

### 3.1 공통 업로드 규칙

- 인코딩: UTF-8 / CP949(EUC-KR) 자동 감지. 첫 행은 헤더로 간주(헤더 매핑 UI에서 컬럼 대응).
- 금액: 천단위 콤마·원화기호·괄호(음수)·공백 제거 후 **정수(원)** 파싱. 소수점은 반올림 없이 거부(통장/카드 원화는 정수). 예: `"1,200,000"→1200000`, `"(50,000)"→-50000`.
- 날짜: `YYYY-MM-DD` / `YYYY.MM.DD` / `YYYYMMDD` 허용 → KST `date`로 정규화. 일시 컬럼이 있으면 `YYYY-MM-DD HH:mm[:ss]`을 KST로 해석 후 UTC `timestamptz` 저장(canon §1.4).
- 한 배치는 단일 `bank_account_id`(통장) 또는 단일 카드(카드사용)에 귀속한다. 혼합 업로드 금지(파일 분리 권장).
- 업로드 결과는 **미리보기(검증) → 확정** 2단계. 미리보기에서 파싱오류·중복 후보·자동분류 예상결과를 보여주고, 확정 시에만 `INSERT`.

### 3.2 통장 거래내역 CSV → `bank_transactions` 필드 매핑

은행마다 컬럼명이 달라 **헤더 매핑 프로파일**(은행별 프리셋 + 사용자 매핑 저장)을 둔다. 표준 내부 필드는 다음과 같다.

| CSV 표준 헤더(예) | 대응 컬럼 | 변환·규칙 |
|---|---|---|
| 거래일자 / 거래일시 | `txn_date` | KST date. 일시면 시각은 dedupe·정렬 보조용으로만 활용 |
| 적요 / 거래내용 | (분류 입력) | 매칭/규칙 패턴 입력 보조(저장은 `counterparty_name` 우선) |
| 입금액 | `amount`(+), `direction='deposit'` | 입금=양수 |
| 출금액 | `amount`(−), `direction='withdraw'` | 출금=음수 저장(부호 규약 §3.4) |
| 거래후잔액 | `balance_after_amount` | 정합 검증용(§7.2) |
| 보내는분/받는분/거래처 | `counterparty_name` | 입금자명·출금처명. **매칭·규칙의 핵심 키** |
| (메모) | — | 필요 시 `transaction_reconciliation_logs.before_json`에 원본 보존 |

인입 시 자동 세팅: `bank_account_id`(배치 귀속), `import_batch_id`, `match_target=NULL(미분류)`, `is_matched=false`, `reconciliation_stage=NULL`(카드매출 입금으로 매칭될 때만 채움), 공통 컬럼(`tenant_id`/`studio_id`/`created_by`).

### 3.3 카드 사용내역 CSV → `card_expenses` 필드 매핑

| CSV 표준 헤더(예) | 대응 컬럼 | 변환·규칙 |
|---|---|---|
| 이용일자 / 이용일시 | `used_at` | KST→UTC timestamptz |
| 가맹점명 / 이용가맹점 | `vendor_name` | **분류·규칙의 핵심 키** |
| 이용금액 / 승인금액 | `amount` | 정수(원). 취소건은 음수 |
| 청구일자 / 결제예정일 | `billed_at` | 청구월 귀속 보조 |
| 카드번호(끝4자리) | `card_no_masked` | 마스킹 저장(원본 금지) |
| 승인번호 | (보조) | dedupe 키 보조(§3.5) |

인입 시 자동 세팅: `import_batch_id`, `match_target=NULL`, `expense_record_id=NULL`, `is_matched=false`. 자동분류 규칙이 일치하면 §6에 따라 `match_target='expense'` + 카테고리 추천을 미리보기에 표시.

### 3.4 부호·방향 규약 (혼동 방지)

| 테이블 | 양수(+) | 음수(−) | 방향 필드 |
|---|---|---|---|
| `bank_transactions` | 입금(돈 들어옴) | 출금(돈 나감) | `direction`(deposit/withdraw)와 일관 |
| `card_expenses` | 일반 사용(지출) | 취소·환불(지출 감소) | 없음(지출 성격 고정) |
| `card_sales` | 매출(받을 돈) | 매출취소 | `reconciliation_stage`로 진행단계 표현 |

> 원장용 한 줄: **통장은 "+면 들어온 돈, −면 나간 돈"**, **카드사용은 "쓴 돈"**, **카드매출은 "손님이 카드로 긁어 우리가 받을 돈"**.

### 3.5 중복제거(dedupe) 키

업로드는 흔히 **기간 겹침 재업로드**가 발생한다. 동일 거래의 재삽입을 막기 위해 **결정적 dedupe 키**를 산출하고, 배치 확정 전 기존 데이터와 대조해 **중복 후보를 제외 또는 사용자 확인**한다.

| 대상 | dedupe 키(정규화 후 해시) | 비고 |
|---|---|---|
| `bank_transactions` | `bank_account_id` + `txn_date` + `amount` + `direction` + `normalize(counterparty_name)` + `balance_after_amount` | 잔액까지 포함해 동일 시각 동일금액 거래 구분. 잔액 없으면 거래순번 보조 |
| `card_expenses` | `card_no_masked` + `used_at(분 단위)` + `amount` + `normalize(vendor_name)` + `승인번호(있으면)` | 승인번호 있으면 사실상 유일 키 |
| `card_sales` | `approval_no`(승인번호) | 카드매출은 승인번호가 자연키. 없으면 `approved_at`+`amount`+가맹/단말 |

- `normalize(name)` = 공백·특수문자 제거 + 대소문자 통일 + 전각/반각 정규화(§5.2와 동일 함수 재사용).
- **dedupe 정책**: 키 완전일치 → **자동 제외(skip)**, 키 부분일치(잔액·승인번호만 차이) → **미리보기에서 "중복 가능" 경고** 후 사용자 선택. 모든 dedupe 판정은 배치 리포트(삽입 N건/중복제외 M건/경고 K건)로 보여준다.
- 동일 배치 내 자기중복(파일 안 중복행)도 동일 키로 1건만 삽입한다.

### 3.6 업로드 검증·확정 흐름

```
function importBank(file, bank_account_id):
  rows = parseCSV(file)                        # 인코딩 자동감지
  for r in rows:
     r.norm = normalizeRow(r)                  # 금액/날짜/이름 정규화
     r.dedupe_key = bankDedupeKey(r.norm)
  dupes = matchExisting(rows.dedupe_key)        # 기존+배치내 중복 검사
  preview = {
     insertable: rows - dupes.exact,
     skipped: dupes.exact,
     warned: dupes.partial,
     autoClassified: applyRules(rows)           # §6 학습규칙 미리적용(추천만)
  }
  return preview                                # 사용자 확인 대기
function confirmImport(preview):
  INSERT preview.insertable INTO bank_transactions (import_batch_id=batchId)
  reconciliation_log('imported', batch=batchId, count=...)   # 배치 단위 이력
  enqueueAutoMatch(insertable)                  # §5 자동매칭 비동기 실행
```

---

## 4. 분류 대상과 매칭 모델 (`match_target`)

### 4.1 `match_target` 4분류 (canon §3.19)

모든 통장 거래(`bank_transactions`)와 카드사용(`card_expenses`)은 다음 중 하나로 귀결된다.

| 코드 | 라벨 | 통장에서의 의미 | 귀결(연결 대상) |
|---|---|---|---|
| `revenue` | 매출 | 회원 결제 입금(계좌이체/카드매출 입금) | `payments`(→ 결제기준 매출, canon §4.1) |
| `expense` | 비용 | 임대료·강사료·공과금 등 출금 / 카드 지출 | `expense_records`(canon §3.13 카테고리) |
| `transfer` | 이체(내부이동) | 본인 다른 계좌 이체·현금인출·카드대금 결제 | 손익 영향 없음(현금흐름만) |
| `etc` | 기타 | 이자·오입금·미상 | 보류/조사 대상 |

> **핵심 구분**: `transfer`(내부이동)는 **매출도 비용도 아니다.** 카드대금 자동이체 출금을 비용으로 잘못 분류하면 카드사용(card_expenses)과 이중계상된다. 그래서 "카드대금 결제 출금"은 반드시 `transfer`로 분류한다(§8.4).

### 4.2 거래 → 비즈니스 객체 매핑 표

| 원천 거래 | match_target | 매칭/연결 대상 | 링크 컬럼 |
|---|---|---|---|
| 통장 입금(계좌이체) | `revenue` | `payments`(입금대기/미수 결제) | `bank_transactions.matched_ref_type='payment'`, `matched_ref_id=payment.id` |
| 통장 입금(카드매출 정산입금) | `revenue` | `card_sales`(deposited 단계) | `card_sales.bank_transaction_id`, 단계=`deposited` |
| 통장 출금(고정/변동 비용) | `expense` | `expense_records`(source='bank') | `expense_records.bank_transaction_id` |
| 통장 출금/입금(내부이동) | `transfer` | (없음) | `matched_ref_type='transfer'` |
| 카드 사용 | `expense` | `expense_records`(source='card') | `expense_records.card_expense_id` |

### 4.3 입금 매칭(매출)의 대상: `payments`

계좌이체/무통장입금 결제는 [`16-payment-refund-policy.md`](./16-payment-refund-policy.md)에서 `payments.payment_status='awaiting_deposit'`(입금대기)으로 생성된다. 본 정책은 **통장 입금 거래를 그 입금대기 결제에 매칭**해 결제를 완결시킨다.

```
매칭 확정 시(매출):
  bank_transactions.match_target = 'revenue'
  bank_transactions.matched_ref_type = 'payment'
  bank_transactions.matched_ref_id   = payment.id
  bank_transactions.is_matched = true
  # 결제 측 반영(소유: 16 결제정책, 본 문서는 트리거만)
  payment.paid_amount += bank_transactions.amount
  payment.payment_status = (paid_amount >= amount) ? 'paid' : 'partial'
  payment.receivable_amount = amount - paid_amount
  # 결제기준 매출 인식(스튜디오 정책 on_deposit이면 이 시점, canon §6.3)
  if studio.revenue_recognition == 'on_deposit':
      upsert revenue_records(basis='payment', source='payment', payment_id=...)
  reconciliation_log('manual_matched'|'auto_matched', txn, payment)
  audit_log('match', bank_transactions, before, after)
```

### 4.4 비용 매칭(통장 출금)의 대상: `expense_records`

출금 거래를 비용으로 분류하면 `expense_records`를 **생성**(또는 기존 수동입력 비용과 연결)한다. 비용 카테고리·고정/변동 성격은 [`18-expense-category-policy.md`](./18-expense-category-policy.md)(canon §3.13/§3.14)를 따른다.

```
비용 매칭 확정 시:
  bank_transactions.match_target = 'expense'
  INSERT expense_records(
     source='bank', bank_transaction_id=txn.id,
     expense_category=<규칙/사용자 선택>, cost_type=<카테고리 기본 or 오버라이드>,
     amount=ABS(txn.amount), vendor_name=txn.counterparty_name,
     expense_date=txn.txn_date)
  bank_transactions.matched_ref_type='expense'; matched_ref_id=expense_records.id; is_matched=true
  reconciliation_log(...); audit_log('match', ...)
```

### 4.5 카드사용 분류의 대상: `expense_records`

카드사용은 본질적으로 **비용**이다(취소건 제외). 분류는 카테고리 결정이 핵심이며 §6 학습 규칙이 가장 강하게 작동한다.

```
card_expenses.match_target = 'expense'
INSERT expense_records(source='card', card_expense_id=ce.id,
   expense_category=<규칙/선택>, cost_type=<...>, amount=ce.amount,
   vendor_name=ce.vendor_name, expense_date=date(ce.used_at))
card_expenses.expense_record_id = expense_records.id; is_matched=true
```

### 4.6 부분·분할 매칭 (예외 절차)

- **한 입금이 여러 결제를 덮는 경우**(합산 입금): 입금 1건을 여러 `payments`에 나눠 매칭. `transaction_reconciliation_logs`에 분할 내역을 `after_json`으로 남기고, 각 결제에 부분 금액을 반영(잔여는 `partial`). 통장 거래는 `is_matched=true`이되 매칭 대상이 복수임을 로그로 보존.
- **한 결제를 여러 입금으로 받는 경우**(분납): 각 입금을 동일 `payment`에 누적 매칭(`paid_amount` 누적, `partial`→`paid`).
- **부분 매칭은 자동확정 금지**(§5.4). 항상 사람 확인. 분할은 1:1 불변식(§1.4-2)의 명시적 예외이며 반드시 로그로 추적한다.

---

## 5. 자동 추천 매칭 알고리즘 (입금자명 ↔ 회원명, 금액·날짜 스코어링)

> 핵심: **통장 입금 거래를 입금대기 결제(`payments`) 후보들과 스코어링**해 랭킹·추천한다. 입금자명(`counterparty_name`) ↔ 회원명/입금자명(`members.name`·`payments.depositor_name`)의 **이름 유사도**, **금액 일치도**, **날짜 근접도**를 가중합한다.

### 5.1 후보 풀(candidate pool)

입금 거래 `T`(direction=deposit)에 대해 매칭 후보는:

```
candidates(T) = payments P WHERE
    P.tenant_id = T.tenant_id AND P.studio_id = T.studio_id
    AND P.payment_method = 'transfer'                 # 계좌이체/무통장 (canon §3.11)
    AND P.payment_status IN ('awaiting_deposit','partial','receivable')
    AND P.created_at BETWEEN (T.txn_date - 30d) AND (T.txn_date + 3d)   # 시간창
```

- 시간창은 정책 파라미터화(기본: 결제 생성 30일 전 ~ 입금 3일 후). 너무 오래된 결제는 후보에서 제외해 오매칭 줄임.

### 5.2 이름 정규화·유사도 (`name_score`)

입금자명은 띄어쓰기·예금주 회사명·동명이인 등 노이즈가 많다. **정규화 후 유사도**를 쓴다.

```
normalize(name):
   - 공백/특수문자 제거, 전각→반각, 영문 소문자화
   - 괄호/직함/접미("님","고객","(주)") 제거
name_score(T,P) = max(
   sim(normalize(T.counterparty_name), normalize(member.name)),
   sim(normalize(T.counterparty_name), normalize(P.depositor_name))   # 결제 시 받아둔 입금자명
)
sim = 1.0(완전일치) | 0.85(정규화 후 일치) | 0.6(포함관계) | Jaro-Winkler 점수(부분)
```

- **`payments.depositor_name`(결제 입력 시 받은 입금예정자명)** 이 있으면 최우선 비교 대상. 회원이 가족 명의로 입금하는 케이스를 흡수한다.

### 5.3 금액·날짜 스코어와 종합 스코어

```
amount_score(T,P):
   diff = ABS(T.amount - P.amount)
   = 1.0  if diff == 0
   = 0.7  if diff <= 1,000원 (수수료·끝자리 차이)
   = 0.4  if T.amount 가 P.amount 의 분납 가능액(부분일치 후보)
   = 0.0  otherwise

date_score(T,P):
   d = (T.txn_date - date(P.created_at)) in days
   = 1.0  if 0 <= d <= 1       # 결제 당일/익일 입금
   = 0.8  if 2 <= d <= 3
   = 0.5  if 4 <= d <= 7
   = 0.2  if 8 <= d <= 30
   = 0.0  otherwise

total_score(T,P) = 0.5*name_score + 0.4*amount_score + 0.1*date_score
```

| 신호 | 가중치 | 근거 |
|---|---|---|
| 이름(`name_score`) | 0.5 | 입금자명↔회원명이 가장 강한 식별자 |
| 금액(`amount_score`) | 0.4 | 횟수권 정찰가라 금액 일치 신뢰도 높음 |
| 날짜(`date_score`) | 0.1 | 보조(입금 지연·선입금 흡수) |

> 가중치·임계값은 `studios.policy_json`로 오버라이드 가능(canon §6 확장 키). 스코어는 0.0~1.0.

### 5.4 후보 랭킹·자동확정 임계

```
ranked = candidates(T) sort by total_score DESC
top = ranked[0]
if top.total_score >= 0.95 AND (no other candidate with score >= 0.80):
     autoConfirmMatch(T, top)            # 단일 강후보 → 자동 확정
     reconciliation_log('auto_matched', rule=null)
elif top.total_score >= 0.60:
     pushToReviewQueue(T, ranked[0..2])  # 상위 3 후보 제시 → 사람 확정
else:
     pushToUnmatchedQueue(T)             # 후보 없음/약함 → 수동 분류
```

- **자동확정 가드**: 최상위 0.95↑ **이면서** 차순위가 0.80↑이면(경쟁 후보 존재) **자동확정 금지**(애매하면 사람에게). 동명이인·동일금액 충돌 보호.
- **부분/분할 후보는 자동확정 대상 아님**(§4.6).
- 자동확정이라도 `is_matched=true`와 함께 **`transaction_reconciliation_logs`+`audit_logs`** 를 남겨 사후 추적·되돌리기를 보장(§7).

### 5.5 예시 (스코어 계산)

입금 거래 `T`: `txn_date=2026-06-03`, `amount=1,200,000`, `counterparty_name="김민지"`.
입금대기 결제 후보:

| 후보 | member.name / depositor_name | P.amount | P.created_at | name | amount | date | **total** |
|---|---|---|---|---|---|---|---|
| P1 | 김민지 / 김민지 | 1,200,000 | 2026-06-02 | 1.00 | 1.00 | 1.0 | **1.00** |
| P2 | 김민지(동명) / — | 1,200,000 | 2026-05-20 | 1.00 | 1.00 | 0.2 | **0.92** |
| P3 | 박서윤 / — | 1,200,000 | 2026-06-03 | 0.0 | 1.00 | 1.0 | **0.50** |

- 최상위 P1=1.00, 차순위 P2=0.92(≥0.80) → **경쟁 후보 존재로 자동확정 금지**, 상위 후보 리스트로 **검토 큐**에 올려 사람이 P1 확정. (동명이인·동일금액 보호 작동 예시)
- 만약 P2가 없거나 0.80 미만이면 P1은 **자동 확정**.

---

## 6. 학습 규칙 — `transaction_matching_rules` (거래처명 → 분류 자동 적용)

> 원본 요구 §7·§18 핵심: **"관리자가 한 번 수정한 거래처 분류는 다음 거래부터 자동 적용."** 이를 `transaction_matching_rules`로 구현한다. 규칙은 **거래처명 패턴**을 보고 `match_target`·`expense_category`·`cost_type`(또는 매출이면 회원/결제 힌트)을 자동 부여한다.

### 6.1 규칙 스키마 (canon §2-31)

| 컬럼 | 의미 | 예 |
|---|---|---|
| `match_field` | 비교 필드 | `counterparty_name`(통장) / `vendor_name`(카드) |
| `pattern` | 비교 문자열/정규식 | `"스타벅스"`, `"^(주)무브먼트$"` |
| `match_type` | 비교 방식 | `exact` / `contains` / `regex` |
| `target_match` | 분류 대상 | `expense` / `revenue` / `transfer` / `etc`(canon §3.19) |
| `expense_category` | 비용 카테고리 | `meal`·`rent`·`instructor_fee`…(canon §3.13, nullable) |
| `cost_type` | 고정/변동 | `fixed`/`variable`(canon §3.14, nullable) |
| `priority` | 우선순위(작을수록 먼저) | `10`, `20`… |
| `is_active` | 활성 | true/false |
| `created_by` | 작성 주체 | 감사 추적 |

### 6.2 규칙 자동 학습(생성/갱신) 트리거

관리자가 **미매칭 큐에서 거래를 수동 분류·재분류**할 때, 시스템은 "이 분류를 다음부터 자동 적용할까요?"를 제안하고, 동의 시 규칙을 **생성 또는 갱신**한다.

```
function onManualClassify(txn, chosen):       # chosen = {target_match, expense_category, cost_type, member?}
  applyClassification(txn, chosen)            # 이번 거래 즉시 반영(§4)
  if user.optInRuleLearning:
     key = {match_field, pattern=normalize(name), match_type='exact'}
     existing = rules WHERE key
     if existing:
         update existing -> chosen            # 분류 변경 시 규칙 갱신(다음 거래부터 새 분류)
         reconciliation_log('reclassified', rule=existing)
     else:
         INSERT transaction_matching_rules(key + chosen, priority=default, is_active=true, created_by=user)
     audit_log('update'|'create', transaction_matching_rules)
```

- **소급 적용 안 함(기본, 불변식 §1.4-6)**: 새 규칙/갱신 규칙은 **이후 인입 거래**부터 적용된다. 기존 미매칭분 일괄 재적용은 §6.5의 명시적 액션.
- 규칙 갱신 시 **이미 매칭된 과거 거래는 바뀌지 않는다**(원장 정합 보호). 바뀌는 것은 미래뿐.

### 6.3 규칙 평가(우선순위·충돌 해결)

인입/재적용 시 한 거래에 대해 규칙을 평가한다.

```
function classifyByRules(txn):
  field = txn[match_field]                     # counterparty_name | vendor_name
  matched = rules WHERE is_active
            AND matches(field, pattern, match_type)
            ORDER BY priority ASC, match_specificity DESC, updated_at DESC
  if matched empty: return null                # → 자동분류 없음(미매칭 큐 또는 §5 매칭 시도)
  winner = matched[0]
  return classification(winner)
```

**충돌 해결 규칙(상위가 우선):**

1. **`priority` 오름차순**: 숫자가 작을수록 먼저(명시적 우선). 같은 priority면 →
2. **구체성(match_specificity)**: `exact` > `regex` > `contains`. 더 구체적인 규칙 우선. 같으면 →
3. **최신성(`updated_at` 최신)**: 최근에 사람이 정한 규칙이 이긴다(학습 반영). 같으면 →
4. **결정적 타이브레이크**: `rule.id` 사전순(재현성 보장).

- **결과는 추천**: `match_target='revenue'`(매출)로 분류돼도 **결제 후보 자동확정은 §5 스코어링**을 거친다(규칙은 "이 거래처는 매출"까지만 단정, 어느 결제인지는 스코어가 정함). 비용/이체/기타는 카테고리까지 자동확정 가능(사람 검토 옵션).

### 6.4 규칙 예시

| priority | match_field | pattern | match_type | target_match | expense_category | cost_type | 의미 |
|---|---|---|---|---|---|---|---|
| 10 | counterparty_name | `OO빌딩관리단` | exact | expense | `rent` | fixed | 임대료 자동분류 |
| 10 | counterparty_name | `한국전력` | contains | expense | `utilities` | variable | 공과금 |
| 15 | vendor_name | `스타벅스` | contains | expense | `meal` | variable | 카드 식대 |
| 20 | counterparty_name | `우리카드대금` | contains | transfer | (null) | (null) | 카드대금=내부이체(이중계상 방지) |
| 30 | counterparty_name | `^(주)필라테스장비.*` | regex | expense | `supplies` | variable | 소모품 정규식 |

### 6.5 규칙 소급 재적용(명시적)

- 관리자는 **"이 규칙을 기존 미매칭 거래에 재적용"** 버튼으로 소급 적용할 수 있다(선택). 대상은 **`is_matched=false`인 거래만**(이미 매칭/분류 확정분은 보호).
- 재적용은 배치로 수행되고, 각 적용 건마다 `transaction_reconciliation_logs('auto_matched'|'reclassified', rule_id=...)`를 남긴다. **이미 확정된 분류를 뒤집지 않는다.**

---

## 7. 미매칭 큐 UX와 데이터 정합

### 7.1 미매칭 큐(Unmatched Queue) 구성

미매칭 큐 = `WHERE is_matched=false AND deleted_at IS NULL`인 `bank_transactions`·`card_expenses` 모음. 원장이 "방치된 돈"을 못 보고 넘기지 않게 하는 핵심 작업대.

| UX 요소 | 동작 |
|---|---|
| 상단 요약 | 미매칭 건수·합계, 입금/출금/카드 탭, 기간 필터 |
| 행(거래) | 날짜·금액·거래처명·추천 분류(있으면 배지)·추천 후보 스코어 |
| 추천 패널 | 입금이면 §5 상위3 결제후보 + 스코어. 비용이면 §6 규칙 추천 카테고리 |
| 빠른 액션 | [매칭 확정] [매출/비용/이체/기타로 분류] [규칙으로 저장] [보류] |
| 일괄 처리 | 동일 거래처 N건 선택→한 번에 분류+규칙 생성(§6.2) |
| 보류(`etc` 임시) | 조사 필요 건은 `etc`로 빼두고 메모. 큐에 남겨 추적 |

- **목표**: 원장이 "이번 달 정리 안 된 거래"를 큐 0건으로 만드는 것이 월말 마감 루틴. 미매칭 잔량은 대시보드(09)·지표(19) "미분류 거래" 경고로 노출.

### 7.2 데이터 정합 검증(통장 잔액 대사)

업로드된 통장 거래는 **잔액 연속성**으로 누락·중복을 검출한다.

```
정합식: balance_after_amount[n] == balance_after_amount[n-1] + amount[n]
   (시간순 정렬, n>=2)  # amount는 입금+ / 출금- (§3.4)
불일치 발견 시: 해당 구간을 "누락/순서오류 의심"으로 표시, 재업로드 유도
계좌 잔액 스냅샷: bank_accounts.balance_amount = 최신 balance_after_amount, last_synced_at 갱신
```

- 카드매출은 **승인합계 vs 입금합계**로 대사(§8). 카드사용은 **청구월 합계 vs 카드대금 출금액**으로 교차검증(§8.4).

### 7.3 정합 불변식 체크리스트

- [ ] 한 거래의 `matched_ref_*`/`expense_record_id`/`bank_transaction_id`는 1:1(분할은 로그로 추적, §4.6)
- [ ] `expense_records.amount` 합 = 매칭된 통장 출금 + 카드사용 합(이체 제외)
- [ ] `is_matched=true`인 거래는 반드시 대응 비즈니스 객체가 존재(고아 매칭 금지)
- [ ] dedupe로 동일 거래 중복 삽입 0건(배치 리포트로 확인)
- [ ] 통장 잔액 연속식 성립(누락구간 0)
- [ ] 카드대금 출금은 `transfer`로 분류되어 비용 이중계상 없음

---

## 8. 카드매출 3단계 대사 (승인일·매입일·입금일)

> 카드 결제는 "긁은 날(승인) → 카드사 매입 → 며칠 뒤 통장 입금"의 시차가 있다. 그 사이 **"카드로 팔았지만 아직 안 들어온 돈(미입금 카드매출)"** 을 추적하는 것이 수익분석의 현금흐름 정확도를 좌우한다. `card_sales.reconciliation_stage`(canon §3.21)로 3단계를 관리한다.

### 8.1 3단계 정의 (canon §3.21)

| 단계 | 코드 | 채워지는 시각 | 의미(원장용) |
|---|---|---|---|
| 승인 | `approved` | `approved_at` | 손님이 카드로 긁어 승인된 시점. **매출은 확정, 돈은 아직** |
| 매입 | `captured` | `captured_at` | 카드사가 매입 처리(정산 대상 확정) |
| 입금 | `deposited` | `deposited_at` | **사업자 통장에 실제 입금**. 수수료 뗀 실수령액 도착 |

### 8.2 금액 산식 (수수료·실입금)

```
fee_amount        = round(amount * studio.card_fee_rate)      # 기본 0.023 (canon §6.3)
net_deposit_amount = amount - fee_amount                       # 실제 통장에 들어올 금액
미입금 카드매출    = Σ card_sales.net_deposit_amount
                     WHERE reconciliation_stage != 'deposited' (canon §4.4)
```

- 실제 입금 매칭 시 통장 입금액(`bank_transactions.amount`)과 `net_deposit_amount`를 비교해 **수수료 실측치로 보정**(추정율 → 실제). 차액은 `fee_amount` 갱신 + 로그.

### 8.3 대사 흐름 (수동 등록 → 입금 매칭)

```
[MVP 수동 등록]
1) 카드매출 입금내역 수동 등록 → INSERT card_sales(approval_no, amount, approved_at,
      reconciliation_stage='approved', fee_amount=round(amount*card_fee_rate),
      net_deposit_amount=amount-fee_amount)
2) (선택) 매입일 입력 시 captured_at, stage='captured'
3) 통장에 정산입금 거래 인입 → §5/§8.5로 card_sales와 매칭:
      card_sales.bank_transaction_id = T.id
      card_sales.deposited_at = T.txn_date
      card_sales.reconciliation_stage = 'deposited'
      bank_transactions.match_target = 'revenue'
      bank_transactions.reconciliation_stage = 'deposited'   # 통장측 단계표시
      fee 실측 보정(net_deposit_amount vs T.amount)
   reconciliation_log('manual_matched', card_sale, bank_txn); audit_log('match', ...)
```

- 현장카드(`card_onsite`) 결제가 있으면 `card_sales.payment_id`로 결제와도 연결해 **결제↔매출↔입금**을 한 줄로 잇는다(매출 이중계상 방지: 결제기준 매출은 결제에서, 입금은 대사용).

### 8.4 카드매출 정산입금 ↔ 카드대금 출금 구분 (이중계상 방지)

| 통장 거래 | 분류 | 이유 |
|---|---|---|
| **카드사 → 우리** 정산입금(매출 입금) | `revenue` + `card_sales` 대사 | 우리가 카드로 판 돈 들어옴 |
| **우리 → 카드사** 카드대금 결제 출금 | `transfer` | 우리가 쓴 사업자카드 대금 납부(=내부이동). 비용은 이미 `card_expenses`로 계상됨 |

> 카드대금 출금을 `expense`로 분류하면 `card_expenses`(개별 사용)와 **이중계상**된다. 그래서 카드대금 출금은 항상 `transfer`(§6.4 priority 20 규칙 예시).

### 8.5 카드매출 입금 매칭 스코어(특수)

카드사 정산입금은 보통 **여러 승인건을 묶어 1건으로 입금**된다(합산정산). 매칭은:

```
후보 = card_sales WHERE stage IN ('approved','captured') AND deposited_at IS NULL
대표 신호:
  - 입금일 근접(정산주기: 보통 영업일 +2~+3)
  - 입금액 ≈ Σ(net_deposit_amount) 부분집합 합(묶음 매칭)
  - counterparty_name 에 카드사/PG명 포함
묶음 매칭: subset-sum 근사로 net_deposit 합 == 입금액 인 card_sales 집합을 추천
        → 사람 확정(합산정산은 자동확정 보수적 적용)
```

- 묶음 매칭된 각 `card_sales`는 동일 `bank_transaction_id`를 가리키고 모두 `deposited`로 전이. 분할/묶음이므로 §4.6 로그 필수.

### 8.6 카드매출 상태도

```
approved ──(매입처리)──▶ captured ──(통장입금 매칭)──▶ deposited
   │                                         ▲
   └──────────(매입정보 없이 바로 입금 확인 시 직접)─┘
취소: approved/captured ──(매출취소)──▶ amount 음수 card_sales 또는 stage 유지+취소표시
```

---

## 9. 2차/3차 연동 대비 (오픈뱅킹·카드매출 통합조회)

> 설계 의도: **MVP의 CSV/수동등록과 2·3차의 자동연동이 동일한 테이블·동일한 매칭/분류/대사 로직을 공유**한다. 인입 경로만 교체된다. (원본 요구 §9 2차/3차, MVP §17)

### 9.1 인입 경로 교체 매핑

| 데이터 | MVP(수동) | 2차/3차(자동) | 공통 귀착 테이블 |
|---|---|---|---|
| 통장 입출금 | CSV 업로드 | 오픈뱅킹 동기화(`external_integrations.provider='open_banking'`) | `bank_transactions` |
| 카드 사용 | CSV 업로드 | 카드 사용내역 조회 | `card_expenses` |
| 카드 매출 | 입금내역 수동 등록 | 카드매출 통합조회(`provider='card_lookup'`) | `card_sales` |
| 온라인 결제 | (해당 없음) | PG 연동(`provider='pg'`) → `payments.payment_provider`·`external_payment_id` | `payments` |
| 세무 공유 | (해당 없음) | 홈택스/리포트 내보내기(`provider='hometax'`) | `financial_reports` |

### 9.2 동기화 이력·실패 추적

- 모든 자동 동기화는 `sync_logs`에 1회 실행을 기록한다: `external_integration_id`·`sync_type`(bank/card_sale/card_expense/notification)·◆`status`(success/partial/failed)·`record_count`·`error_message`·`started_at`/`finished_at`(canon §2-40).
- 자동 동기화 1회 = 1 `import_batch_id`로 매핑(§2). 따라서 **CSV 배치와 자동 배치가 동일 추적·롤백 모델**을 공유한다.
- 연동 자격증명은 `external_integrations.credential_ref`(시크릿 참조)로만 보관, 원본 비밀 저장 금지(canon §2-39).

### 9.3 마이그레이션 시 dedupe 연속성

- CSV로 이미 넣은 기간을 오픈뱅킹이 다시 가져와도 §3.5 dedupe 키가 동일하게 작동해 **중복 삽입을 막는다**(`bank_transactions` 키에 `bank_account_id`+`txn_date`+`amount`+`direction`+이름+잔액).
- 전환 시점에 **중복기간 경계**를 `import_batch`로 명시(예: "6/1까지 CSV, 6/2부터 오픈뱅킹")해 경계 중복을 사용자 확인 처리.

---

## 10. 감사 추적과 이력 (transaction_reconciliation_logs + audit_logs)

> 모든 매칭/분류/해제/재분류는 **두 층의 기록**을 남긴다. 금전·정합 데이터이므로 누가·언제·무엇을 바꿨는지 100% 추적 가능해야 한다(원본 §14, canon §1.2·§5).

### 10.1 두 이력 테이블의 역할 분리

| 테이블 | 역할 | 키 필드 |
|---|---|---|
| `transaction_reconciliation_logs` | **매칭/분류 업무 이력**(상세 before/after, 규칙 추적) | `txn_type`(bank/card_sale/card_expense), `txn_id`, `action`, `before_json`, `after_json`, `rule_id`, `staff_id`, `processed_at` |
| `audit_logs` | **금전 감사 로그**(전사 공통, append-only) | `actor_user_id`, `actor_role`, `entity_type`, `entity_id`, `action`(match/update/delete/export…), `before_json`, `after_json`, `ip_address`, `occurred_at` |

### 10.2 `transaction_reconciliation_logs.action` 값

| action | 발생 상황 |
|---|---|
| `imported` | 배치 인입 확정(§3.6, 배치 단위 1건) |
| `auto_matched` | §5 스코어 자동확정 / §6 규칙 자동분류 |
| `manual_matched` | 미매칭 큐에서 사람이 확정 매칭(§7) |
| `unmatched` | 매칭/분류 해제(되돌리기) |
| `reclassified` | 기존 분류를 다른 대상/카테고리로 변경(+규칙 갱신, §6.2) |

### 10.3 되돌리기(unmatch)와 정합 복원

```
function unmatch(txn):
  before = snapshot(txn + linked)              # payment/expense_record/card_sale 상태
  # 비즈니스 측 원복 (소유 정책 호출)
  if txn.match_target=='revenue' && payment: revert payment.paid_amount/status (16정책)
  if txn.match_target=='expense' && expense_record: soft-delete or detach expense_record
  if linked card_sale: stage 되돌림(deposited→captured), deposited_at=null
  txn.match_target=NULL; txn.matched_ref_*=NULL; txn.is_matched=false; txn.reconciliation_stage=NULL
  reconciliation_log('unmatched', txn, before, after)
  audit_log('update', txn, before, after)      # canon §5
```

- 되돌리기는 **원천 거래를 지우지 않는다**(불변식 §1.4-1). 분류/매칭 메타만 NULL로 되돌리고 모든 변경을 로그로 남긴다.
- 비용 `expense_records`는 물리삭제 대신 `deleted_at` 소프트삭제(금전·세무 추적 보존).

### 10.4 권한(RBAC, canon §5 / [`13-rbac.md`](./13-rbac.md))

- **통장/카드/매칭** 리소스: `owner`=RU, `accountant`=CRUD, `manager`/`info_staff`/`instructor`/`member`=접근 불가.
- **통장 잔액**: `instructor`는 **불가**(canon §5 명시). 강사는 전체 매출·통장 접근 차단.
- 규칙(`transaction_matching_rules`) 생성/수정은 `owner`·`accountant`만. 모든 변경에 `created_by`/`audit_logs`.

---

## 11. 종합 처리 흐름 (End-to-End)

```
[CSV/동기화 인입] ─dedupe─▶ [원천 거래 적재(batch)]
        │
        ├─▶ classifyByRules(§6)  ── 규칙 일치 ──▶ 자동분류(비용/이체/기타 확정 가능)
        │                          규칙 '매출' ──▶ §5 스코어링으로 결제 후보 매칭
        │
        ├─▶ autoMatch(§5)        ── 단일 강후보(≥0.95, 경쟁無) ──▶ 자동확정
        │                          경쟁/약후보 ──▶ 검토 큐(상위3)
        │
        └─▶ 무후보/무규칙        ──▶ 미매칭 큐(§7)  ──사람분류──▶ (옵션)규칙 학습(§6.2)
                                                         │
[카드매출] approved→captured→deposited(§8) ◀── 통장 입금 매칭 ──┘
        │
   모든 확정/해제/재분류 ─▶ transaction_reconciliation_logs + audit_logs(§10)
        │
        ▼
   결제기준 매출(canon §4.1) / 비용(expense_records) / 현금흐름 지표(19-metrics)
```

---

## 12. 검증 체크리스트 (QA 연계, [`22-qa-checklist.md`](./22-qa-checklist.md))

- [ ] CSV 업로드: 인코딩 자동감지, 금액/날짜/이름 정규화, 미리보기→확정 2단계 동작
- [ ] dedupe 키로 재업로드 중복 0건, 부분일치는 "중복 가능" 경고 노출
- [ ] 통장 부호 규약(입금+/출금−)·`direction` 일관, 잔액 연속식 성립(누락구간 검출)
- [ ] 입금 자동매칭 스코어: name 0.5 / amount 0.4 / date 0.1, 임계 0.95 자동확정·경쟁(≥0.80) 시 보류
- [ ] 동명이인·동일금액 충돌 시 자동확정 금지(검토 큐로)
- [ ] 부분/분할/묶음(카드정산) 매칭은 자동확정 금지·로그 필수
- [ ] 학습 규칙: 수동 분류→규칙 생성/갱신, **다음 거래부터** 적용(소급 안 함), 우선순위(priority→구체성→최신성→id) 충돌해결
- [ ] 카드대금 출금=`transfer`로 분류되어 `card_expenses`와 이중계상 없음
- [ ] 카드매출 3단계(approved→captured→deposited) 전이, `net_deposit_amount=amount-fee_amount`, 미입금 카드매출 합 정확
- [ ] 입금 매칭 시 수수료 실측 보정·`reconciliation_stage='deposited'` 통장측 표시
- [ ] 모든 매칭/분류/해제/재분류에 `transaction_reconciliation_logs` + `audit_logs` 기록
- [ ] 되돌리기(unmatch) 시 원천 거래 보존, 비즈니스 측(payment/expense/card_sale) 정합 원복
- [ ] 강사(`instructor`)는 통장/카드/매칭·통장 잔액 접근 불가(canon §5)
- [ ] 2차 오픈뱅킹/카드조회 전환 시 동일 dedupe·매칭·대사 로직 재사용, `sync_logs` 실패 추적

---

## 관련 문서

- [`00-canon.md`](./00-canon.md) — 단일 진실원천(`bank_*`·`card_*`·`transaction_*` §2, `match_target` §3.19, `reconciliation_stage` §3.21, 카드수수료율 §6.3, 이중회계 §4)
- [`06-scope-phases.md`](./06-scope-phases.md) — 2차/3차(오픈뱅킹·카드조회·PG) 확장 범위
- [`09-admin-dashboard.md`](./09-admin-dashboard.md) — 미입금 카드매출·미수금·미분류 거래 노출
- [`11-erd.md`](./11-erd.md) — `bank_transactions`·`card_sales`·`card_expenses`·`transaction_matching_rules`·`transaction_reconciliation_logs` 상세 컬럼/인덱스/제약
- [`12-api.md`](./12-api.md) — 거래 업로드·자동매칭·분류·규칙·대사 API
- [`13-rbac.md`](./13-rbac.md) — 통장/카드/매칭·통장 잔액 권한 스코프
- [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) — 입금 매칭 대상(`payments`)·결제 상태·미수금·환불
- [`18-expense-category-policy.md`](./18-expense-category-policy.md) — 비용 카테고리 17종·고정/변동비·반복비용 자동분류
- [`19-metrics.md`](./19-metrics.md) — 결제기준 매출·현금흐름·미입금 카드매출·미수금 지표 산식
- [`20-saas-architecture.md`](./20-saas-architecture.md) — `external_integrations`·`sync_logs`·테넌시 격리(금융연동)
- [`22-qa-checklist.md`](./22-qa-checklist.md) — 매칭·분류·대사 정합/감사 검증 항목
- [`23-risks.md`](./23-risks.md) — 금융연동·오매칭·정합성·권한 리스크 대응
