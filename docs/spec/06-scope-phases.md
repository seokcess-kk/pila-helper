# 06-scope-phases.md — 2차/3차 확장 범위

> **목적**: MVP(`05-scope-mvp.md`) 이후의 2차·3차 확장 기능을 항목별로 **목적 · 선행조건 · 데이터/연동 의존성**과 함께 정의하고, **언제 다음 단계로 넘어갈지(단계 전환 기준)** 를 정량 지표로 못 박는다. 근거: [`_source-requirements.md`](./_source-requirements.md) §9·§17, 계약: [`00-canon.md`](./00-canon.md).

본 문서는 새 테이블·enum·정책 파라미터를 **정의하지 않는다**. 모든 테이블명·컬럼명·enum 값·역할명·카테고리명은 [`00-canon.md`](./00-canon.md)의 단일 진실원천을 글자 단위로 인용한다. 충돌 시 canon이 우선한다.

---

## 0. 단계 구분 한눈에 보기

| 단계 | 한 줄 정의 | 핵심 가치 | 대표 신규 테이블/연동 | 운영 형태 |
|---|---|---|---|---|
| **MVP** | 단일 샵 내부 운영 + 수동 기록 | 예약·수강권·결제·기본 손익을 손으로 굴린다 | (CSV 업로드 + 수동 매칭) | 우리 샵 1곳 |
| **2차** | 자동화 + 깊은 수익분석 | 손으로 하던 분류·매칭·예측을 자동화, 강사·수업·유입경로 수익성 | `transaction_matching_rules` 활성화, `card_sales`, `settlements`, 알림톡 | 우리 샵 1~소수 |
| **3차** | 금융연동 + 멀티테넌트 SaaS 상품화 | 오픈뱅킹·PG·세무 자동 흐름, 외부 샵 온보딩·과금 | `external_integrations`, `bank_accounts` 라이브, `subscription_plans`, `tenant_subscriptions` | 외부 샵 다수(SaaS) |

> 핵심 설계 원칙: **MVP 단계에서 이미 2차·3차용 테이블 스키마는 canon에 존재**한다. 단계 확장은 "새 테이블을 만드는 일"이 아니라 **이미 설계된 테이블에 데이터를 채우고 자동화/외부연동을 켜는 일**이다. 이 때문에 MVP에서도 `bank_transactions`·`card_sales`·`external_integrations` 등이 canon에 정의되어 있다(원본 §9·§15·§16).

---

## 1. 2차 확장 범위 (Phase 2 — 자동화 + 수익성 심화)

원본 §17 2차: *거래내역 자동분류 · 입금 자동 매칭 · 카드매출 입금 대조 · 반복 비용 자동 등록 · 월말 예상 손익 · 강사별/수업별/유입경로별 수익성 · 재등록 자동화 · 알림톡 연동 · 운동일지/강사 코멘트.*

2차의 공통 테마는 **"MVP에서 사람이 수동으로 하던 일을 시스템이 대신한다"** 이다. MVP에서 쌓인 실데이터(매칭 이력·분류 이력·소진 이력)가 자동화의 학습/규칙 원천이 된다.

### 2-1. 거래내역 자동분류 (Auto-classification)

| 항목 | 내용 |
|---|---|
| **목적** | 통장 출금·카드 사용 내역을 거래처명 기반 규칙으로 **자동으로 비용 카테고리(17종)·비용성격(고정/변동)·분류대상**에 매핑. 원장이 매번 손으로 분류하지 않게 함. "한 번 수정한 거래처 분류는 다음 거래부터 자동 적용"(원본 §7·§18). |
| **선행조건** | MVP에서 CSV 업로드(`bank_transactions`/`card_expenses`)와 **수동 분류 이력**이 충분히 누적(아래 전환 기준). 수동 분류가 `transaction_reconciliation_logs`에 쌓여 규칙화 후보가 됨. |
| **데이터 의존성** | `transaction_matching_rules`(규칙: `match_field`=`counterparty_name`/`vendor_name`, `pattern`, `match_type`=`exact`/`contains`/`regex`, `target_match`◆`match_target`, `expense_category`◆, `cost_type`◆, `priority`, `is_active`) · `bank_transactions.match_target`◆ · `card_expenses.match_target`◆·`expense_category` 결과 반영 · `expense_records`(분류 확정 시 생성) · `transaction_reconciliation_logs`(action=`reclassified`/`auto_matched`). |
| **연동 의존성** | 없음(내부 규칙 엔진). 외부 API 불필요 — 그래서 3차가 아니라 2차다. |
| **동작 산식(우선순위 적용)** | 한 거래에 복수 규칙이 매칭되면 `priority` 오름차순(작을수록 우선)으로 1건 적용. 매칭 없으면 `match_target`을 미분류로 두고 미매칭 목록에 노출. |

**자동분류 규칙 예시**

| `match_field` | `pattern` | `match_type` | `target_match` | `expense_category` | `cost_type` | `priority` |
|---|---|---|---|---|---|---|
| `vendor_name` | `(주)필라테스교육원` | `contains` | `expense` | `education` | `variable` | 10 |
| `vendor_name` | `한국전력` | `contains` | `expense` | `utilities` | `variable` | 10 |
| `counterparty_name` | `^임대인 홍길동$` | `regex` | `expense` | `rent` | `fixed` | 5 |
| `counterparty_name` | `토스페이먼츠` | `contains` | `revenue` | (해당없음) | (해당없음) | 20 |

> 규칙 수정 시 **소급 적용 안 함, 다음 거래부터 적용**이 원칙(원본 §18). 단 관리자가 "기존 미매칭 건에 일괄 재적용" 버튼을 누르면 `transaction_reconciliation_logs.action='reclassified'`로 batch 처리. 상세는 [`18-expense-category-policy.md`](./18-expense-category-policy.md)·[`17-reconciliation-policy.md`](./17-reconciliation-policy.md) 소유.

### 2-2. 입금 자동 매칭 (회원 결제 ↔ 통장 입금)

| 항목 | 내용 |
|---|---|
| **목적** | 계좌이체/무통장입금 결제(`payment_method`=`transfer`/`cash` 후 입금)를 통장 입금 거래와 **금액·날짜·입금자명 기준 자동 매칭**. MVP에서 손으로 짝짓던 일을 자동화. |
| **선행조건** | MVP의 수동 매칭(입금자명↔회원명) 경험치 누적. `payments.depositor_name` 입력 습관 정착. |
| **데이터 의존성** | `bank_transactions`(`direction`=`deposit`, `counterparty_name`, `amount`, `txn_date`, `match_target`=`revenue`, `matched_ref_type`/`matched_ref_id`→`payments`, `is_matched`◆) · `payments`(`payment_status` `awaiting_deposit`→`paid`, `paid_at`, `paid_amount`, `receivable_amount` 갱신) · `transaction_reconciliation_logs`(`txn_type='bank'`, `action='auto_matched'`). |
| **연동 의존성** | 없음(내부 추천 엔진). 오픈뱅킹은 3차이며, 2차는 여전히 **CSV 업로드된 통장거래** 대상. |
| **자동 매칭 점수 산식** | 후보 점수 = (금액 일치 가중치) + (날짜 근접 가중치) + (입금자명 유사도). 예: `score = 0.5·(amount==expected) + 0.2·(|txn_date − purchased_date| ≤ 1일) + 0.3·name_similarity(counterparty_name, member.name)`. `score ≥ 0.85` 자동 확정, `0.6 ≤ score < 0.85` 추천(관리자 1클릭 확정), `< 0.6` 미매칭. |

**입금 자동 매칭 예시**

| 통장 입금(`bank_transactions`) | 결제 대기(`payments`) | 점수 | 처리 |
|---|---|---|---|
| 350,000원 / 06-10 / 입금자 "김민지" | 350,000원 / 06-09 구매 / `depositor_name`="김민지" / `awaiting_deposit` | 1.00 | 자동 확정 → `paid` |
| 350,000원 / 06-10 / 입금자 "김민지부" | 350,000원 / 06-09 / `awaiting_deposit` | 0.83 | 추천(1클릭 확정) |
| 80,000원 / 06-10 / 입금자 "ㅇㅇㅇ" | 대응 없음 | 0.50 | 미매칭 목록 |

> 자동 확정 시 결제기준 매출 인식(`revenue_records` `revenue_basis='payment'`)이 트리거된다(회계 모델 [`00-canon.md`](./00-canon.md) §4.1, [`16-payment-refund-policy.md`](./16-payment-refund-policy.md)).

### 2-3. 카드매출 입금 대조 (승인 → 매입 → 입금 3단계)

| 항목 | 내용 |
|---|---|
| **목적** | 현장 카드결제의 **승인일/매입일/입금일** 3단계를 추적해 "카드로 팔았지만 아직 통장에 안 들어온 돈(미입금 카드매출)"을 정확히 집계. 원장 대시보드 ④의 핵심 지표. |
| **선행조건** | MVP에서 카드매출 입금내역을 **수동 등록**하던 운영 정착(원본 §9 MVP: "카드매출 입금내역 수동 등록"). 2차는 이를 통장거래와 자동 대조. |
| **데이터 의존성** | `card_sales`(`approval_no`, `amount`, `approved_at`, `captured_at`, `deposited_at`, `reconciliation_stage`◆ `approved`/`captured`/`deposited`, `fee_amount`, `net_deposit_amount`, `bank_transaction_id`→`bank_transactions`) · `payments`(`payment_method='card_onsite'`, `card_approval_no`) · `bank_transactions`(`reconciliation_stage`◆ 카드사 입금 매칭) · `expense_records`(`expense_category='payment_fee'`로 카드수수료 인식). |
| **연동 의존성** | 2차는 **카드사 입금 CSV/수동** 기반. 카드매출 통합조회 API(VAN/카드사)는 **3차**. |
| **산식** | 카드수수료 추정 = `amount × card_fee_rate`(canon §6.3 기본 `0.023`) → `fee_amount`. 실입금 `net_deposit_amount = amount − fee_amount`. **미입금 카드매출** = Σ`card_sales.net_deposit_amount` where `reconciliation_stage != deposited`(canon §4.4). |

**카드매출 3단계 추적 예시**

| `approval_no` | `amount` | `approved_at` | `captured_at` | `deposited_at` | `reconciliation_stage` | `fee_amount`(2.3%) | `net_deposit_amount` |
|---|---|---|---|---|---|---|---|
| A12345 | 1,000,000 | 06-03 | 06-04 | 06-06 | `deposited` | 23,000 | 977,000 |
| A12346 | 500,000 | 06-11 | 06-12 | (미입금) | `captured` | 11,500 | 488,500 |
| A12347 | 300,000 | 06-12 | (미매입) | (미입금) | `approved` | 6,900 | 293,100 |

위 예시에서 **미입금 카드매출 = 488,500 + 293,100 = 781,600원**. 비전문가 설명: "카드로 130만원어치 더 팔았는데(50만+30만), 아직 통장엔 안 들어온 실수령 예정액이 약 78만원"이다.

### 2-4. 반복 비용 자동 등록 (Recurring expense)

| 항목 | 내용 |
|---|---|
| **목적** | 임대료·관리비·통신비·세무기장료·보험료 등 **매달 같은 금액/거래처**의 고정비를 매월 자동으로 `expense_records`에 생성. 원장이 매달 입력하는 수고 제거. |
| **선행조건** | MVP 수동 비용 입력으로 정기 비용 패턴 식별. 비용 카테고리(17종) 정착. |
| **데이터 의존성** | `expense_records`(`is_recurring`◆=true, `expense_category`◆, `cost_type`◆=주로 `fixed`, `vendor_name`, `amount`, `expense_date`, `source='manual'` 또는 규칙기반) · `expense_categories`(`default_cost_type`). 반복 스케줄 메타는 `expense_records`의 `is_recurring` + 정책 파라미터로 관리(상세 [`18-expense-category-policy.md`](./18-expense-category-policy.md)). |
| **연동 의존성** | 없음(스케줄러/배치). |
| **자동 생성 + 실거래 대조** | 매월 1일 예정 반복비용을 `expense_records`에 선반영(예상치) → 실제 통장 출금(`bank_transactions` 자동분류 2-1)과 매칭되면 확정, 금액 차이 시 알림. 이로써 **월말 예상 지출(2-5)** 정확도 향상. |

**반복 비용 예시**

| `expense_category` | `cost_type` | `vendor_name` | `amount` | 주기 | `is_recurring` |
|---|---|---|---|---|---|
| `rent` | `fixed` | 건물주 임대 | 2,500,000 | 매월 5일 | true |
| `maintenance_fee` | `fixed` | 관리사무소 | 300,000 | 매월 25일 | true |
| `telecom` | `fixed` | 통신사 | 88,000 | 매월 15일 | true |
| `tax_accounting` | `fixed` | 세무사 사무소 | 110,000 | 매월 10일 | true |

### 2-5. 월말 예상 손익 (Month-end forecast)

| 항목 | 내용 |
|---|---|
| **목적** | 월 중간에 **월말 예상 매출·예상 영업이익·예상 현금잔고**를 보여줘 원장이 한 달을 미리 운전하게 함. 원본 §8 "월말 예상 매출/영업이익/현금잔고", §13 ④ "월말 예상 이익". |
| **선행조건** | 2-3(카드매출 입금 추적)·2-4(반복비용)·MVP 매출/비용 데이터. 예측은 누적 실적 + 미실현분(예약·미입금·반복비용)을 합산하므로 선행 자동화 필요. |
| **데이터 의존성** | `revenue_records`(누적 실현 매출, basis별) · `reservations`+`passes`(남은 달 소진 예정분) · `card_sales`(미입금분) · `payments`(미수금 `receivable_amount`) · `expense_records`(`is_recurring` 예정분 + 실현분) · `bank_accounts.balance_amount`(현 잔액 스냅샷). |
| **연동 의존성** | 없음(내부 집계). 대시보드는 [`10-profit-dashboard.md`](./10-profit-dashboard.md) 소유. |

**월말 예상 산식(비전문가 설명 + 산식 병기)**

```
월말 예상 매출(결제기준)
  = 이번 달 현재까지 인식한 결제기준 순매출
  + (이번 달 남은 기간 예약·등록 예상 결제액)            ← 예약/추세 기반 추정

월말 예상 영업이익
  = 월말 예상 순매출
  − (이번 달 현재까지 비용 합)
  − (반복비용 미반영 예정분 expense_records.is_recurring)
  − (변동비 추정분: 강사료·결제수수료 등 소진/매출 비례)

월말 예상 현금잔고
  = 현재 통장 잔액(bank_accounts.balance_amount)
  + 미입금 카드매출 net_deposit_amount(입금 예정)         ← reconciliation_stage != deposited
  + 미수금 회수 예상(payments.receivable_amount × 회수율)
  − 남은 기간 예정 지출(반복비용 + 예정 변동비)
```

> "예상"은 추정치임을 UI에 명시하고, 실현될 때마다 자동 보정. 결제기준/소진기준 토글에 따라 예상 매출 산식의 첫 줄이 달라진다(소진기준이면 "남은 예약의 소진 단가 합"). 회계 모델은 [`00-canon.md`](./00-canon.md) §4, 지표 정의는 [`19-metrics.md`](./19-metrics.md).

### 2-6. 강사별/수업별/유입경로별 수익성 (Profitability breakdown)

| 항목 | 내용 |
|---|---|
| **목적** | **소진기준 매출**을 강사·수업유형·유입경로 차원으로 분해해 "누가/무엇이/어디서 들어온 회원이 돈을 버는가"를 분석. 우리 솔루션 핵심 차별화(원본 §6·§8·§12). |
| **선행조건** | 소진기준 매출 인식이 데이터로 충분히 쌓여야 함(MVP에서 `revenue_basis='consumption'` 레코드 누적). 강사 정산 기준(2-7 연계)·유입경로 입력 정착. |
| **데이터 의존성** | `revenue_records`(`revenue_basis='consumption'`, `class_type`◆, `instructor_staff_id`→`staff`, `marketing_source`◆) — **이 차원 분해는 소진기준에서만 가능**(canon §4.2·§4.3). 결제기준은 상품 단위라 강사/수업 분해 불가. · `settlements`(강사료) · `expense_records`(`instructor_fee`·`advertising`로 채널 비용). |
| **연동 의존성** | 없음(내부 집계). 시각화는 [`10-profit-dashboard.md`](./10-profit-dashboard.md), 산식은 [`19-metrics.md`](./19-metrics.md). |

**수익성 분해 산식**

| 차원 | 매출(소진기준) | 직접비용 | 수익성(기여이익) |
|---|---|---|---|
| 강사별 | Σ`revenue_records.amount` where `instructor_staff_id=X`, `revenue_basis='consumption'` | 해당 강사 `settlements.total_amount`(`instructor_fee`) | 매출 − 강사료 |
| 수업유형별 | Σ amount where `class_type='personal'`(또는 `group`/`trial`) | 배분된 강사료·공간원가 | 매출 − 배분원가 |
| 유입경로별 | Σ amount where `marketing_source=Y` | 해당 채널 `advertising`(canon `marketing_sources.is_paid=true`인 채널) | 매출 − 광고비 → 채널 ROAS |

> 예: 유입경로 `ad`(광고)로 들어온 회원의 소진기준 누적매출 1,200만원, 해당 기간 `advertising` 300만원 → ROAS 4.0, 채널 기여이익 900만원. `referral`(지인소개)은 광고비 0 → 순수 기여. 이 분석으로 광고 예산 재배분 의사결정.

### 2-7. 재등록 자동화 (Re-enrollment automation)

| 항목 | 내용 |
|---|---|
| **목적** | 수강권 잔여 부족·만료 임박·장기 미방문 회원을 **자동 감지 → 재등록 상담/알림 트리거**. 재등록률을 운영지표가 아니라 자동화 파이프라인으로 전환(원본 §11·§17). |
| **선행조건** | 알림 채널 가동(2-8 알림톡 또는 MVP SMS). `passes`·`attendance` 데이터로 만료·미방문 판정 가능. canon §6.2 임계값(`low_count_threshold`=2, `expiring_alert_days`=7) §6.4(`long_absence_days`=21) 적용. |
| **데이터 의존성** | `passes`(`remaining_count`, `expire_date`, `pass_status`) · `attendance`(최근 출석일) · `members`(`member_status` `enrolled`→자동 태그) · `notifications`+`notification_templates`(`notification_type`=`pass_low_count`/`pass_expiring`/`long_absence`/`re_enroll`) · `members` 태그(`tag` `expiring`/`long_absent`/`re_enroll_likely`) · `counseling_logs`(`next_action_at` 리마인드). |
| **연동 의존성** | 알림 채널(SMS는 MVP/알림톡은 2-8). |

**자동 감지 규칙 예시**

| 트리거 조건 | 부여 태그 | 발송 `notification_type` |
|---|---|---|
| `passes.remaining_count ≤ low_count_threshold`(2) | `expiring` | `pass_low_count` |
| `passes.expire_date − 오늘 ≤ expiring_alert_days`(7) | `expiring` | `pass_expiring` |
| 마지막 `attendance.checked_at` 후 `long_absence_days`(21) 경과 | `long_absent` | `long_absence` |
| 만료(`pass_status='expired'`) 후 미재등록 N일 | `re_enroll_likely` | `re_enroll` |

### 2-8. 알림톡 연동 (KakaoTalk Alimtalk)

| 항목 | 내용 |
|---|---|
| **목적** | MVP의 SMS 발송을 **카카오 알림톡**으로 확장(도달률·비용·브랜드). 13종 알림 유형을 알림톡 채널로 발송. |
| **선행조건** | 알림톡 사업자 채널·발신프로필·템플릿 사전심사 완료. canon `default_channel` 기본 `sms` → 2차 `kakao`(§6.4). |
| **데이터 의존성** | `notification_templates`(`channel='kakao'`, `body_template` 변수치환) · `notifications`(`channel='kakao'`, `status` `scheduled`/`sent`/`failed`, `error_message`). |
| **연동 의존성** | **외부 연동 필요** — `external_integrations`(`provider='kakao_alimtalk'`, `credential_ref`, `status`) · `sync_logs`(`sync_type='notification'`). 카카오 알림톡은 외부 API라 연동 설정이 필요하지만, 금융/계약처럼 무겁지 않아 2차에 배치(3차의 오픈뱅킹/PG와 구분). |

> 알림톡 실패(반려/미달) 시 SMS 폴백 정책을 둘 수 있다(`channel` 폴백). 13종 유형은 canon §3.20, 정책은 알림 정책 문서로 위임.

### 2-9. 운동일지 / 강사 코멘트 (Exercise log / Instructor comment)

| 항목 | 내용 |
|---|---|
| **목적** | 강사가 회원별 수업 수행·코멘트를 남겨 회원 케어 품질과 재등록을 높임. 권한 분리 대상(강사는 담당 회원 메모만, 원본 §12·§14). |
| **선행조건** | 강사 계정·담당 수업 배정 운영. RBAC상 강사 스코프(`assigned`) 적용. |
| **데이터 의존성** | `instructor_comments`(`member_id`→, `staff_id`→, `class_session_id`→ nullable, `content`, `commented_at`) · `exercise_logs`(`member_id`→, `class_session_id`→, `staff_id`→, `content`, `metrics_json`, `logged_at`). |
| **연동 의존성** | 없음. 권한 제약은 [`13-rbac.md`](./13-rbac.md)(강사: 강사 코멘트/운동일지 `CRUD(assigned)`, 전체 매출·통장 잔액 불가). |

---

## 2. 3차 확장 범위 (Phase 3 — 금융연동 + SaaS 상품화)

원본 §17 3차: *오픈뱅킹 · 카드매출 조회 · 온라인 결제/PG · 전자계약 · 네이버 예약/플레이스 · 다지점 관리 · SaaS 요금제 · 외부 샵 온보딩 · 세무 리포트 내보내기.*

3차의 공통 테마는 **"외부 시스템과 실시간 연동하고, 우리 샵을 넘어 외부 샵에 파는 SaaS 상품이 된다"** 이다. 외부 API 인증·과금·법적 계약이 얽혀 무겁고, 2차 자동화가 안정화된 위에서만 가치가 산다.

### 3-1. 오픈뱅킹 (금융결제원 Open Banking)

| 항목 | 내용 |
|---|---|
| **목적** | CSV 업로드를 대체해 **사업자 통장 입출금을 실시간 자동 수집**. 2차의 자동분류·입금매칭이 사람 손 없이 돈다. |
| **선행조건** | 2-1(자동분류)·2-2(입금 자동매칭) 안정화. 오픈뱅킹 이용기관 등록·보안 심사. canon `bank_accounts.is_open_banking_linked`◆=true 전환. |
| **데이터 의존성** | `bank_accounts`(`is_open_banking_linked`=true, `last_synced_at`, `balance_amount`) · `bank_transactions`(API 자동 적재, `import_batch_id` 대신 동기화 단위) → 이후 흐름은 2차 매칭 로직 재사용. |
| **연동 의존성** | `external_integrations`(`provider='open_banking'`, `status` `connected`/`error`) · `sync_logs`(`sync_type='bank'`, `status` `success`/`partial`/`failed`, `record_count`). |

### 3-2. 카드매출 통합조회 (Card sales lookup)

| 항목 | 내용 |
|---|---|
| **목적** | 카드사/VAN에서 **카드매출 승인·매입·입금 데이터를 자동 수집**해 2-3(3단계 대조)을 무인화. 미입금 카드매출 집계가 실시간화. |
| **선행조건** | 2-3(카드매출 입금 대조) 운영 정착. 카드사 조회 계정/스크래핑 또는 공식 API 확보. |
| **데이터 의존성** | `card_sales`(자동 적재: `approval_no`·`approved_at`·`captured_at`·`deposited_at`·`reconciliation_stage`·`fee_amount`·`net_deposit_amount`) · `bank_transactions`(입금 자동 매칭) · `expense_records`(`payment_fee` 자동 인식). |
| **연동 의존성** | `external_integrations`(`provider='card_lookup'`) · `sync_logs`(`sync_type='card_sale'`). |

### 3-3. 온라인 결제 / PG (Payment Gateway)

| 항목 | 내용 |
|---|---|
| **목적** | 회원 모바일 웹에서 **카드/간편결제로 직접 수강권 구매**. 현장결제·무통장 중심 구조에서 비대면 결제로 확장(원본 §5 "온라인 결제는 2~3차"). |
| **선행조건** | 결제 흐름·환불 정책 안정화([`16-payment-refund-policy.md`](./16-payment-refund-policy.md)). PG 가맹 계약. canon이 MVP부터 비워둔 PG 대비 필드 활성화. |
| **데이터 의존성** | `payments`(`payment_method='online'`, `payment_provider`, `external_payment_id`, `payment_status` `paid`) · `refunds`(PG 환불 연동, `status`/`refund_method`) · `revenue_records`(결제 즉시 결제기준 인식). |
| **연동 의존성** | `external_integrations`(`provider='pg'`) · `sync_logs`. |

> `payment_provider`·`external_payment_id`는 **MVP의 `payments`에 이미 nullable로 존재**(canon §2-21, 원본 §5). 3차는 채워 넣을 뿐이다.

### 3-4. 전자계약 (E-contract)

| 항목 | 내용 |
|---|---|
| **목적** | 수강권 약관·환불 규정 동의를 **전자서명으로 체결·보관**. 환불 분쟁 대비 증빙. |
| **선행조건** | 환불 정책 확정([`16-payment-refund-policy.md`](./16-payment-refund-policy.md), canon §6.3 위약 공제율 등). 전자서명 사업자 연동. |
| **데이터 의존성** | `external_integrations`(`provider`는 전자계약 제공자) · `purchases`/`refunds` 증빙 링크(파일 URL) · `audit_logs`(계약 체결 이력). |
| **연동 의존성** | 외부 전자서명 API. |

### 3-5. 네이버 예약/플레이스 연동 (Naver booking/place)

| 항목 | 내용 |
|---|---|
| **목적** | 네이버 플레이스/예약에서 들어온 예약·문의를 우리 시스템과 동기화해 유입경로 자동 태깅과 중복관리 제거. |
| **선행조건** | 예약/세션 모델 안정화. 유입경로(`marketing_source` `naver_place`) 운영. |
| **데이터 의존성** | `reservations`/`class_sessions`(외부 예약 매핑) · `leads`/`members`(`marketing_source='naver_place'` 자동 세팅) · `marketing_sources`. |
| **연동 의존성** | `external_integrations`(네이버) · `sync_logs`. |

### 3-6. 다지점 관리 (Multi-studio)

| 항목 | 내용 |
|---|---|
| **목적** | 한 브랜드(테넌트)가 **여러 지점(`studios`)을 한 화면에서 통합 운영·비교**. 지점별·통합 손익. |
| **선행조건** | 단일 샵 운영 안정화. canon의 `tenant_id`+`studio_id` 분리가 MVP부터 존재하므로 데이터 모델 변경 없음 — **권한·집계·UI 확장**이 핵심. |
| **데이터 의존성** | 전 업무 테이블의 `studio_id`(canon §1.2 공통컬럼) · `studios`(지점 마스터) · 지점 간 비교용 `revenue_records`/`expense_records` 집계. |
| **연동 의존성** | 없음(내부). 아키텍처는 [`20-saas-architecture.md`](./20-saas-architecture.md). |

### 3-7. SaaS 요금제 (Subscription plans)

| 항목 | 내용 |
|---|---|
| **목적** | 외부 샵에 **구독형으로 판매**. 요금제별 기능 제한·발송량·금융연동 한도·지점 수 제한. |
| **선행조건** | 멀티테넌트 격리 검증(3-6) + 외부 샵 온보딩(3-8) 준비. |
| **데이터 의존성** | `subscription_plans`(글로벌: `code`, `price_amount`, `billing_cycle` `monthly`/`yearly`, `feature_limits_json`) · `tenant_subscriptions`(`tenant_id`→, `subscription_plan_id`→, `status` `trial`/`active`/`past_due`/`canceled`/`suspended`, `amount`, `usage_json`, `next_billing_at`). |
| **연동 의존성** | 구독 과금에 3-3 PG 재사용 가능. |

### 3-8. 외부 샵 온보딩 (External studio onboarding)

| 항목 | 내용 |
|---|---|
| **목적** | 우리 샵 전용에서 **외부 샵을 셀프 가입·초기설정**시켜 진짜 SaaS로 전환. 테넌트 생성·정책 기본값 주입·역할 초대. |
| **선행조건** | 3-6·3-7 + RBAC/감사로그 견고화. `saas_admin` 역할 운영. |
| **데이터 의존성** | `tenants`(생성, `status='active'`) · `studios`(`policy_json` 기본값 = canon §6) · `users`/`roles`/`permissions`(역할 초대, `status='invited'`) · `tenant_subscriptions`(`status='trial'` 시작). |
| **연동 의존성** | 이메일/SMS 초대(알림 채널 재사용). 아키텍처 [`20-saas-architecture.md`](./20-saas-architecture.md). |

### 3-9. 세무 리포트 내보내기 (Tax report export)

| 항목 | 내용 |
|---|---|
| **목적** | 월말 마감 손익·현금흐름을 **세무사/회계사 공유용 포맷으로 내보내기**. 홈택스/세금계산서 검토 흐름 연결(원본 §9 3차). |
| **선행조건** | 비용 분류·매출 인식 정합성 확보(2차 자동화 안정). 결제기준/소진기준 손익 확정([`00-canon.md`](./00-canon.md) §4). |
| **데이터 의존성** | `financial_reports`(`report_type` `monthly_pl`/`cashflow`/`tax_export`, `revenue_basis`◆, `period_start_date`/`period_end_date`, `data_json`, `export_file_url`, `generated_by`→`users`) · `revenue_records`·`expense_records` 집계. |
| **연동 의존성** | 홈택스 검토는 선택적 외부연동(`external_integrations` `provider='hometax'`). 기본 내보내기는 내부 파일 생성만으로 가능. |

---

## 3. 단계 전환 기준 (Phase Gates — 언제 다음 단계로 가는가)

> 단계 전환은 **"기능이 있다/없다"가 아니라 운영 데이터·정합성·반복고통이 임계를 넘었는가"** 로 판단한다. 아래는 게이트 체크리스트.

### 3.1 MVP → 2차 전환 게이트

다음을 **모두** 충족하면 2차 자동화에 투자한다.

| 게이트 | 정량 기준 | 근거 |
|---|---|---|
| 매칭 노동 임계 | 월 통장/카드 거래 **100건↑** & 수동 분류/매칭에 **주 2시간↑** 소요 | 자동분류·자동매칭 ROI 발생(2-1·2-2) |
| 분류 규칙 학습량 | 수동 분류 이력(`transaction_reconciliation_logs`) **누적 200건↑**, 거래처 종류 **30종↑** | 규칙(`transaction_matching_rules`) 신뢰도 확보 |
| 소진 데이터 충분 | `revenue_records` `revenue_basis='consumption'` **누적 500건↑**, 활동 강사 **2명↑** | 강사/수업/유입경로 수익성 분석 의미(2-6) |
| 결제 안정 | 결제·환불·미수 흐름 운영 정착, 미수금 회수 패턴 데이터 존재 | 월말 예측(2-5) 입력 확보 |
| 알림 수요 | SMS 발송 **월 200건↑** 또는 도달률/비용 불만 | 알림톡 전환 가치(2-8) |
| 데이터 정합성 | MVP QA 체크리스트([`22-qa-checklist.md`](./22-qa-checklist.md)) 상태전이·금액 검증 통과율 **100%** | 자동화가 오류를 증폭하지 않도록 |

### 3.2 2차 → 3차 전환 게이트

다음을 **모두** 충족하면 금융연동·SaaS 상품화에 투자한다.

| 게이트 | 정량 기준 | 근거 |
|---|---|---|
| 자동화 신뢰도 | 자동분류 정확도 **95%↑**, 입금 자동매칭 자동확정 비율 **80%↑**(오매칭 1%↓) | 오픈뱅킹·카드조회가 수동을 대체할 자격(3-1·3-2) |
| 카드 3단계 정합 | `card_sales` 입금 대조 미매칭 **5%↓**, 미입금 카드매출 집계 신뢰 | 카드매출 통합조회 가치(3-2) |
| 비대면 결제 수요 | 신규 등록 중 비대면 결제 희망 **20%↑** 또는 원거리/예약결제 요청 누적 | PG 도입 ROI(3-3) |
| 외부 판매 수요 | 외부 샵 **3곳↑** 사용 의향(LOI/대기명단) | SaaS 상품화·온보딩 정당화(3-7·3-8) |
| 멀티테넌트 격리 검증 | `tenant_id`/`studio_id` 격리·RBAC 침투테스트 통과, 감사로그 100% 적재 | 외부 데이터를 받을 안전성(3-6·3-8, [`23-risks.md`](./23-risks.md)) |
| 세무 마감 정합 | 결제기준/소진기준 손익이 외부 세무사 검증을 통과 | 세무 리포트 내보내기 신뢰(3-9) |

### 3.3 게이트 운영 원칙

- **게이트는 OR가 아니라 AND**다(전부 충족). 한 항목이라도 미달이면 해당 단계 기능은 보류하고 선행 단계를 보강한다.
- 단계 내에서도 **의존 순서**를 지킨다: 2차는 (자동분류·입금매칭) → (카드 3단계·반복비용) → (월말예측·수익성) → (알림톡·재등록) → (운동일지). 3차는 (오픈뱅킹·카드조회) → (PG·전자계약) → (네이버) → (다지점·요금제·온보딩) → (세무 리포트).
- **금융·돈이 걸린 기능일수록 게이트를 보수적으로**. 오매칭/오인식은 원장 의사결정을 망치므로 정확도 기준을 우선한다(원본 §18 "모든 금전 관련 수정은 로그", canon RBAC §5).
- 단계 전환 시 영향 문서: [`21-roadmap.md`](./21-roadmap.md)(일정 반영) · [`20-saas-architecture.md`](./20-saas-architecture.md)(아키텍처) · [`22-qa-checklist.md`](./22-qa-checklist.md)(검증 추가).

---

## 4. 단계별 테이블·연동 활성화 매트릭스

> canon §2의 테이블이 **각 단계에서 어떻게 쓰이는지**. (MVP=핵심 사용, 2차=자동화로 본격 채움, 3차=외부연동으로 라이브)

| 테이블 / 연동 | MVP | 2차 | 3차 |
|---|---|---|---|
| `members`·`leads`·`counseling_logs`·`marketing_sources` | ● 사용 | ● 재등록 자동화 | ● 네이버 자동 태깅 |
| `class_sessions`·`reservations`·`waitlists`·`attendance` | ● 사용 | ● | ● 네이버 예약 동기화 |
| `products`·`passes`·`pass_transactions` | ● 사용 | ● 소진 분석 | ● |
| `purchases`·`payments`·`refunds` | ● 수동 기록 | ● 입금 자동매칭 | ● PG/전자계약 |
| `revenue_records`(결제·소진) | ● 기본 손익 | ● 차원별 수익성 | ● 세무 리포트 |
| `expense_records`·`expense_categories` | ● 수동 입력 | ● 자동분류·반복비용 | ● |
| `bank_transactions` | ○ CSV 업로드 | ● 자동분류·자동매칭 | ● 오픈뱅킹 라이브 |
| `bank_accounts` | ○ 메타만 | ◐ 잔액 스냅샷 | ● 오픈뱅킹 연동 |
| `card_sales` | ○ 수동 등록 | ● 3단계 대조 | ● 카드매출 통합조회 |
| `card_expenses` | ○ CSV 업로드 | ● 자동분류 | ● |
| `transaction_matching_rules`·`transaction_reconciliation_logs` | ○ 수동 매칭 이력 | ● 규칙 자동적용 | ● |
| `settlements` | – | ● 강사 정산·수익성 | ● |
| `notification_templates`·`notifications` | ◐ SMS | ● 알림톡 | ● |
| `instructor_comments`·`exercise_logs` | – | ● 도입 | ● |
| `financial_reports` | ◐ 기본 집계 | ● 월말 예측 | ● 세무 내보내기 |
| `external_integrations`·`sync_logs` | ○ 스키마만 | ◐ 알림톡 연동 | ● 오픈뱅킹/PG/카드/네이버 |
| `subscription_plans`·`tenant_subscriptions` | ○ 스키마만 | – | ● SaaS 과금 |
| `tenants`·`studios` | ● 단일 운영 | ● | ● 다지점·외부 온보딩 |

범례: ● 핵심 사용 · ◐ 부분 사용 · ○ 스키마/수동만 · – 미사용. MVP에서 ○로 표시된 테이블도 **canon에 정의가 존재**해 단계 확장 시 마이그레이션이 거의 없다(원본 §15·§16).

---

## 관련 문서

- [`00-canon.md`](./00-canon.md) — 단일 진실원천(스키마·enum·RBAC·회계모델·정책 기본값). 본 문서의 모든 명칭의 정의 권한.
- [`05-scope-mvp.md`](./05-scope-mvp.md) — MVP 범위(본 문서의 출발점).
- [`04-feature-catalog.md`](./04-feature-catalog.md) — 전체 기능 목록(2/3차 포함 매핑).
- [`10-profit-dashboard.md`](./10-profit-dashboard.md) — 수익분석 대시보드(월말 예측·수익성 시각화).
- [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) — 결제/환불 정책(입금매칭·PG 의존).
- [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) — 거래 매칭 정책(자동분류·자동매칭 상세).
- [`18-expense-category-policy.md`](./18-expense-category-policy.md) — 비용 카테고리·반복비용 정책.
- [`19-metrics.md`](./19-metrics.md) — 수익분석 지표 정의(수익성·예측 산식).
- [`20-saas-architecture.md`](./20-saas-architecture.md) — SaaS 확장 아키텍처(다지점·요금제·온보딩).
- [`21-roadmap.md`](./21-roadmap.md) — 개발 우선순위(단계 일정).
- [`23-risks.md`](./23-risks.md) — 운영 리스크(금융연동·정합성·권한).
