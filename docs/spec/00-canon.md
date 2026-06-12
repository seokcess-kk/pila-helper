# 00-canon.md — 단일 진실원천 (SSOT, Canon)

> **이 문서는 계약(contract)이다.** `docs/spec/`의 모든 후속 설계 문서(01~23)는 이 문서에 정의된
> 네이밍 규약 · 엔티티 사전 · enum 사전 · 회계 모델 · RBAC · 정책 파라미터를 **글자 단위로** 따라야 한다.
> 본 문서와 충돌하는 후속 문서 내용은 무효이며, 변경이 필요하면 먼저 이 문서를 개정한다.
> 근거 원본: [`_source-requirements.md`](./_source-requirements.md) (정본 소스).

- **제품**: 필라테스 샵 예약·회원권·출석·상담CRM·매출·비용·수익분석 통합 경영관리 SaaS
- **핵심 차별화**: 수익분석(이중 손익 회계 모델) · 경영관리 · 통장/카드 자동 매칭
- **아키텍처 전제**: multi-tenant, `tenant_id` + `studio_id` 기반 데이터 분리, MVP부터 SaaS·금융연동 확장 고려
- **문서 버전**: v1.0 / 기준일 2026-06-12

---

## 0. 용어와 표기 규칙

- enum 값은 **영문 코드(snake_case) + 한글 라벨** 병기로 표기한다. 예: `no_show`(노쇼).
- 코드(저장값)는 항상 영문 snake_case이며, 한글 라벨은 UI 표시용이다. **DB·API에는 영문 코드만 저장/전송**한다.
- FK 컬럼은 `<단수형엔티티>_id` 형식. 예: `member_id`, `class_session_id`.
- 본 문서에서 `→`는 FK 참조, `★`는 금액(정수, 원) 필드, `◆`는 상태 enum 필드를 표시한다.

---

## 1. 네이밍 규약 (Naming Convention)

### 1.1 식별자 규칙

| 대상 | 규칙 | 예시 |
|---|---|---|
| 테이블명 | snake_case, **복수형** | `class_sessions`, `pass_transactions` |
| 컬럼명 | snake_case, **단수형** | `tenant_id`, `start_at`, `total_count` |
| FK 컬럼 | `<참조테이블단수>_id` | `member_id`, `pass_id`, `created_by` |
| enum 컬럼 | 단수 의미 명사 + `_status`/`_type`/`_kind`/`_reason` | `member_status`, `class_type` |
| enum 값 | snake_case 영문 코드 | `no_show`, `awaiting_deposit` |
| 불리언 | `is_` / `has_` 접두 | `is_public`, `has_refund` |
| 금액 | `_amount` 접미, **정수(원)** | `paid_amount`, `refund_amount` |
| 시각 | `_at` 접미, UTC 저장 | `created_at`, `start_at` |
| 날짜 | `_date` 접미, KST 기준 날짜 | `start_date`, `expire_date` |
| 인덱스 | `idx_<table>_<cols>` | `idx_reservations_session_status` |
| 외래키 제약 | `fk_<table>_<ref>` | `fk_payments_member` |

### 1.2 공통 컬럼 (모든 테넌트 데이터 테이블 필수)

모든 업무 테이블은 아래 공통 컬럼을 **반드시** 포함한다. (예외: 글로벌 SaaS 테이블 `tenants`, `subscription_plans`, 순수 코드 테이블은 `studio_id` 미보유 가능 — 각 엔티티 정의에서 명시)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid (PK) | 전역 고유 식별자. UUIDv7 권장(시간정렬). |
| `tenant_id` | uuid → `tenants.id` | 테넌트(계약 단위) 분리 키. **모든 쿼리 필수 필터**. |
| `studio_id` | uuid → `studios.id` | 지점(샵) 분리 키. 테넌트 하위. |
| `created_at` | timestamptz | 생성 시각 (UTC). |
| `updated_at` | timestamptz | 최종 수정 시각 (UTC). |
| `deleted_at` | timestamptz nullable | **소프트 삭제** 시각. NULL=활성. 물리 삭제 금지(금전·감사 데이터). |
| `created_by` | uuid → `users.id` nullable | 생성 주체 사용자. 시스템 생성 시 NULL. |

> 부가로 변경 추적이 중요한 테이블은 `updated_by` 컬럼을 둘 수 있다(선택). 모든 수정/삭제/환불/수강권 차감 변경은 별도 `audit_logs`에 기록(§5, §2 참조).

### 1.3 금액 · 통화 규약

- **모든 금액은 정수 타입(BIGINT)으로 저장하며 단위는 원(KRW)**이다. 소수점·실수(float) 금지.
- 비율(영업이익률, 전환율 등)은 저장하지 않고 **조회 시 계산**한다. 부득이 저장 시 `_rate` 접미 + `numeric(7,4)`(0.0000~1.0000) 사용.
- 통화는 단일 통화(KRW) 가정. 다통화 확장 시 `currency` 컬럼(ISO 4217) 추가.

### 1.4 날짜 · 시각 규약

- **저장**: 모든 시각(`_at`)은 **UTC `timestamptz`**. 날짜(`_date`)는 KST(Asia/Seoul) 기준의 `date`.
- **표시·정책 판정**: 운영 타임존은 스튜디오별 `timezone`(기본 `Asia/Seoul`). 예약오픈/마감/취소마감 계산은 스튜디오 타임존 기준.
- **분 단위 정책 값**은 `_minutes`(정수, 분), 일 단위는 `_days`(정수, 일) 접미.
- 시간 범위는 `start_at` / `end_at` 쌍. 반열림 구간 `[start, end)`로 해석.

---

## 2. 엔티티 사전 (Entity Dictionary)

> 원본 §16의 **42개 테이블 전부**를 정의한다. 각 항목은 한 줄 설명 + 핵심 컬럼(FK·상태 enum·금액). 공통 컬럼(§1.2)은 생략하고 **고유 컬럼만** 기재. 상세 컬럼·인덱스·제약은 `11-erd.md`가 소유하되 본 사전을 벗어날 수 없다.

### A. 테넌시 · 조직 (SaaS Core)

1. **`tenants`** — SaaS 계약 단위(보통 브랜드/사업자). *글로벌 테이블(자기 자신이 tenant_id 근원)*.
   핵심: `name`, `business_no`(사업자번호), `owner_user_id`→`users`, ◆`status`(active/suspended/closed).
2. **`studios`** — 테넌트 하위 물리 지점(샵). 데이터 분리 2차 키.
   핵심: `tenant_id`, `name`, `timezone`(기본 Asia/Seoul), `address`, `phone`, ◆`status`(active/inactive), `policy_json`(§6 정책 파라미터 오버라이드).
3. **`users`** — 로그인 계정(직원·강사·회원·SaaS관리자 공통 인증 주체).
   핵심: `tenant_id`(nullable for saas_admin), `email`, `phone`, `password_hash`, ◆`role`(§3.18), `member_id`→`members`(회원계정 연결, nullable), `staff_id`→`staff`(직원/강사 연결, nullable), ◆`status`(active/invited/suspended).
4. **`roles`** — 역할 코드 사전(권한 부여 단위). *코드 테이블*.
   핵심: `code`(§3.18 role enum), `name_ko`(라벨), `description`.
5. **`permissions`** — 리소스×액션 권한 항목 사전 및 역할-권한 매핑.
   핵심: `role_code`→`roles.code`, `resource`(예: members/payments/revenue), `action`(read/create/update/delete/export), `scope`(all/own/assigned).

### B. 사람 · CRM

6. **`members`** — 등록/잠재 **회원** 마스터(상담고객 포함, 전환 시 동일 레코드 승격).
   핵심: `name`, `phone`, `gender`(male/female/other), `birth_date`, ◆`member_status`(§3.1), `marketing_source`→`marketing_sources` 또는 ◆(§3.16), `goal`(운동 목적), `medical_note`(통증/주의), `memo`, `assigned_staff_id`→`staff`.
7. **`leads`** — 상담 파이프라인(문의→체험→등록) 추적 레코드. member 1:N 가능(문의 건별).
   핵심: `member_id`→`members`(전환 후 연결), `name`, `phone`, ◆`lead_status`(§3.2), `marketing_source`◆(§3.16), `inquiry_date`, `trial_booked_date`, `trial_done_date`, `enrolled_date`, `lost_reason`, `assigned_staff_id`→`staff`.
8. **`staff`** — 직원·강사 마스터(프로필·근무·정산 기준).
   핵심: `user_id`→`users`(nullable), `name`, `phone`, ◆`role`(§3.18: owner/manager/info_staff/instructor/accountant), `employment_type`(fulltime/parttime/freelance), ◆`status`(active/inactive), `available_hours_json`(근무 가능 시간), `settlement_method`(강사료 정산 방식 코드).
9. **`counseling_logs`** — 상담 이력(통화/방문/메시지 기록 한 건).
   핵심: `lead_id`→`leads`, `member_id`→`members`(nullable), `staff_id`→`staff`, `channel`(call/visit/message/etc), `content`, `consulted_at`, `next_action_at`(리마인드).
10. **`marketing_sources`** — 유입경로 코드 사전(샵별 커스텀 가능). *코드+데이터 혼합*.
    핵심: `code`(§3.16 marketing_source), `name_ko`, `is_paid`(광고성 여부), `is_active`.

### C. 수업 · 공간 · 예약 · 출석

11. **`rooms`** — 수업 공간(룸/존). 정원·동시수업 제약 단위.
    핵심: `name`, `capacity`(정수), ◆`status`(active/inactive).
12. **`class_templates`** — 정규/반복 수업의 설계 템플릿(요일·시간·강사·정원·정책).
    핵심: ◆`class_type`(§3.3), `name`, `instructor_staff_id`→`staff`, `room_id`→`rooms`, `capacity`, `duration_minutes`, `recurrence_rule`(RRULE), `is_public`(◆boolean), `booking_open_days`/`booking_close_minutes`/`cancel_deadline_minutes`(정책 오버라이드, §6).
13. **`class_sessions`** — 실제 발생하는 개별 수업 회차(예약·출석의 기준).
    핵심: `class_template_id`→`class_templates`(nullable; 단일수업은 NULL), ◆`class_type`(§3.3), `name`(회차 표시명), `instructor_staff_id`→`staff`, `room_id`→`rooms`, `start_at`, `end_at`, `capacity`, `waitlist_capacity`, ◆`session_status`(§3.4), `is_public`◆, `substitute_staff_id`→`staff`(대체 강사, nullable).
14. **`reservations`** — 회원의 특정 회차 예약 1건(차감·출석의 연결점).
    핵심: `class_session_id`→`class_sessions`, `member_id`→`members`, `pass_id`→`passes`(차감 대상), ◆`reservation_status`(§3.5), `booked_at`, `canceled_at`, `cancel_reason`, `is_self_booked`◆(회원 직접/대리), `is_late_cancel`◆(지각취소 여부, §3.5 메타), `pass_transaction_id`→`pass_transactions`(차감/복구 연결).
15. **`waitlists`** — 정원 초과 시 대기 신청 큐(자동 전환 대상).
    핵심: `class_session_id`→`class_sessions`, `member_id`→`members`, `pass_id`→`passes`, `position`(순번 정수), ◆`status`(waiting/promoted/canceled/expired), `requested_at`, `promoted_at`.
16. **`attendance`** — 출석 처리 결과(노쇼/지각/정상). reservation 1:1.
    핵심: `reservation_id`→`reservations`, `class_session_id`→`class_sessions`, `member_id`→`members`, ◆`attendance_status`(§3.6), `checked_at`, `checked_by`→`users`, `deducted`(◆boolean 차감 여부).

### D. 상품 · 수강권 · 차감

17. **`products`** — 판매 상품(수강권 상품 정의: 권종·총횟수·기간·가격).
    핵심: `name`, ◆`pass_kind`(§3.7), `total_count`(횟수, nullable=무제한 부적용), `valid_days`(유효기간 일수), ★`price_amount`, `allowed_class_types`(json: personal/group/trial), `holdable`(◆정지가능), `max_hold_days`.
18. **`passes`** — 회원이 보유한 **개별 수강권 인스턴스**(잔여·만료·정지 상태).
    핵심: `member_id`→`members`, `product_id`→`products`, `purchase_id`→`purchases`, ◆`pass_kind`(§3.7), `total_count`, `remaining_count`, `start_date`, `expire_date`, ◆`pass_status`(§3.8), `paused_at`, `paused_days_used`, ★`unit_price_amount`(소진기준 단가=결제액/총횟수, §4).
19. **`pass_transactions`** — 수강권 횟수 증감 원장(차감/복구/수동조정 1건씩, 불변 append-only).
    핵심: `pass_id`→`passes`, `member_id`→`members`, ◆`reason`(§3.9 pass_txn_reason), `delta`(정수: 음수=차감/양수=복구), `balance_after`(처리 후 잔여), `reservation_id`→`reservations`(nullable), `attendance_id`→`attendance`(nullable), `memo`, `created_by`(수동조정 주체).

### E. 결제 · 환불 · 매출

20. **`purchases`** — 구매 주문(상품 구매 헤더; 1구매=1수강권 발급 기본).
    핵심: `member_id`→`members`, `product_id`→`products`, `pass_id`→`passes`(발급 결과), ★`list_amount`(정가), ★`discount_amount`, ★`final_amount`(실판매가), `purchased_at`, `seller_staff_id`→`staff`.
21. **`payments`** — 결제 기록(수단·승인·입금대기·미수 상태 포함).
    핵심: `purchase_id`→`purchases`, `member_id`→`members`, ◆`payment_status`(§3.10), ◆`payment_method`(§3.11), ★`amount`(결제액), ★`paid_amount`(실수령), `paid_at`, `card_approval_no`(승인번호), `depositor_name`(입금자명), `payment_provider`(PG 대비, nullable), `external_payment_id`(nullable), `receivable_amount`(미수금=amount-paid_amount), `staff_id`→`staff`(담당), `memo`.
22. **`refunds`** — 환불 기록(부분/전액·사유·잔여횟수 회수 반영).
    핵심: `payment_id`→`payments`, `purchase_id`→`purchases`, `member_id`→`members`, ★`refund_amount`, `refund_reason`, `refunded_at`, `restored_count`(복구 회수), ◆`status`(requested/completed/canceled), `refund_method`◆(§3.11 준용), `staff_id`→`staff`.
23. **`revenue_records`** — **매출 인식 원장**(이중 기준의 핵심, §4). 결제기준·소진기준 모두 적재.
    핵심: `member_id`→`members`, ◆`revenue_basis`(§3.12: payment/consumption), `source_type`(payment/refund/consumption), `payment_id`→`payments`(nullable), `pass_transaction_id`→`pass_transactions`(nullable), `product_id`→`products`, ◆`class_type`(§3.3, 소진 기준), `instructor_staff_id`→`staff`(nullable), `marketing_source`◆(§3.16), ★`amount`(인식액; 환불·차감은 음수 가능), `recognized_at`, `recognized_date`, `is_new_member`◆, `is_re_enroll`◆.

### F. 비용 · 정산

24. **`expense_records`** — 비용 인식 원장(통장 출금·카드 사용·수동 입력 통합).
    핵심: ◆`expense_category`(§3.13), ◆`cost_type`(§3.14 fixed/variable), ★`amount`, `vendor_name`(거래처), `expense_date`, `source`(bank/card/manual), `bank_transaction_id`→`bank_transactions`(nullable), `card_expense_id`→`card_expenses`(nullable), `is_recurring`◆, `receipt_file_url`, `doc_memo`(세금계산서/영수증 메모), `staff_id`→`staff`(귀속 강사료 시).
25. **`expense_categories`** — 비용 카테고리 사전(17종 기본값 + 샵 커스텀). *코드+데이터*.
    핵심: `code`(§3.13 expense_category), `name_ko`, ◆`default_cost_type`(§3.14), `is_active`, `sort_order`.
26. **`settlements`** — 강사/직원 정산 집계(기간별 강사료·기여도 산정).
    핵심: `staff_id`→`staff`, `period_start_date`, `period_end_date`, `session_count`(출석 기준 수업 수), ★`base_amount`, ★`bonus_amount`, ★`deduction_amount`, ★`total_amount`, ◆`status`(draft/confirmed/paid), `confirmed_at`, `paid_at`.

### G. 금융 연동 · 거래 매칭

27. **`bank_accounts`** — 사업자 통장 계좌(오픈뱅킹 대비; MVP는 메타만).
    핵심: `bank_code`, `account_no_masked`, `account_holder`, ★`balance_amount`(현재 잔액 스냅샷), `last_synced_at`, ◆`status`(active/inactive), `is_open_banking_linked`◆.
28. **`bank_transactions`** — 통장 입출금 거래내역(CSV 업로드/오픈뱅킹).
    핵심: `bank_account_id`→`bank_accounts`, `txn_date`, ★`amount`(입금+/출금-), `direction`(deposit/withdraw), `counterparty_name`(입금자/출금처명), `balance_after_amount`, ◆`match_target`(§3.19), `matched_ref_type`/`matched_ref_id`(payment/expense/transfer 등 연결), ◆`reconciliation_stage`(§3.21 nullable, 카드매출 입금 시), `is_matched`◆, `import_batch_id`.
29. **`card_sales`** — 카드 **매출** 내역(승인일/매입일/입금일 3단계, 미입금 추적).
    핵심: `payment_id`→`payments`(nullable, 현장결제 연결), `approval_no`, ★`amount`, `approved_at`(승인일), `captured_at`(매입일 nullable), `deposited_at`(입금일 nullable), ◆`reconciliation_stage`(§3.21: approved/captured/deposited), ★`fee_amount`(카드수수료), ★`net_deposit_amount`(실입금=amount-fee), `bank_transaction_id`→`bank_transactions`(입금 매칭, nullable).
30. **`card_expenses`** — 사업자 카드 **사용(지출)** 내역(CSV/카드사 조회).
    핵심: `card_no_masked`, `vendor_name`, ★`amount`, `used_at`, `billed_at`(청구일), ◆`match_target`(§3.19), `expense_record_id`→`expense_records`(분류 결과, nullable), `is_matched`◆, `import_batch_id`.
31. **`transaction_matching_rules`** — 거래처명 기반 자동 분류 규칙(수정 시 다음 거래부터 자동 적용).
    핵심: `match_field`(counterparty_name/vendor_name), `pattern`(문자열/정규식), `match_type`(exact/contains/regex), ◆`target_match`(§3.19), ◆`expense_category`(§3.13, nullable), ◆`cost_type`(§3.14, nullable), `priority`(정수), `is_active`◆, `created_by`.
32. **`transaction_reconciliation_logs`** — 거래 매칭/분류 처리 이력(누가 무엇을 어떻게 매칭).
    핵심: `txn_type`(bank/card_sale/card_expense), `txn_id`(대상 거래 id), `action`(auto_matched/manual_matched/unmatched/reclassified), `before_json`, `after_json`, `rule_id`→`transaction_matching_rules`(nullable), `staff_id`→`staff`, `processed_at`.

### H. 알림 · 운동기록 · 강사코멘트

33. **`notification_templates`** — 알림 메시지 템플릿(13종 유형별 본문·채널).
    핵심: ◆`notification_type`(§3.20), `channel`(sms/kakao/push/email), `title`, `body_template`(변수치환), `is_active`◆.
34. **`notifications`** — 발송된/예약된 알림 1건(이력·상태).
    핵심: `member_id`→`members`(nullable), `template_id`→`notification_templates`, ◆`notification_type`(§3.20), `channel`, ◆`status`(scheduled/sent/failed/canceled), `scheduled_at`, `sent_at`, `payload_json`, `error_message`.
35. **`instructor_comments`** — 강사가 남기는 회원별 코멘트(권한 분리 대상).
    핵심: `member_id`→`members`, `staff_id`→`staff`, `class_session_id`→`class_sessions`(nullable), `content`, `commented_at`.
36. **`exercise_logs`** — 회원 운동일지(수업별 수행 기록; 2차 기능).
    핵심: `member_id`→`members`, `class_session_id`→`class_sessions`, `staff_id`→`staff`, `content`, `metrics_json`, `logged_at`.

### I. 리포트 · 감사 · 외부연동

37. **`financial_reports`** — 재무/손익 리포트 스냅샷(월말 마감·세무 공유용 내보내기).
    핵심: `report_type`(monthly_pl/cashflow/tax_export/etc), ◆`revenue_basis`(§3.12), `period_start_date`, `period_end_date`, `data_json`(집계 결과), `generated_at`, `generated_by`→`users`, `export_file_url`.
38. **`audit_logs`** — **감사 로그**(모든 수정/삭제/환불/수강권 차감 변경 기록; §1 필수).
    핵심: `actor_user_id`→`users`, `actor_role`◆(§3.18), `entity_type`(테이블명), `entity_id`, `action`(create/update/delete/refund/pass_adjust/match/login/export), `before_json`, `after_json`, `ip_address`, `occurred_at`. *append-only, deleted_at 미사용*.
39. **`external_integrations`** — 외부 서비스 연동 설정(오픈뱅킹·PG·알림톡·카드조회 계정).
    핵심: `provider`(open_banking/pg/kakao_alimtalk/card_lookup/hometax 등), `credential_ref`(시크릿 참조), ◆`status`(connected/disconnected/error), `connected_at`, `config_json`.
40. **`sync_logs`** — 외부 연동 동기화 실행·실패 이력.
    핵심: `external_integration_id`→`external_integrations`, `sync_type`(bank/card_sale/card_expense/notification), ◆`status`(success/partial/failed), `started_at`, `finished_at`, `record_count`, `error_message`.

### J. SaaS 과금

41. **`subscription_plans`** — SaaS 요금제(기능 제한·발송량·연동 한도). *글로벌 테이블*.
    핵심: `code`, `name`, ★`price_amount`, `billing_cycle`(monthly/yearly), `feature_limits_json`(스튜디오 수/알림 발송량/금융연동 등), `is_active`◆.
42. **`tenant_subscriptions`** — 테넌트의 구독 계약(요금제·기간·상태·과금).
    핵심: `tenant_id`→`tenants`, `subscription_plan_id`→`subscription_plans`, ◆`status`(trial/active/past_due/canceled/suspended), `started_at`, `current_period_end_at`, ★`amount`, `usage_json`(사용량 기반 과금 누적), `next_billing_at`.

> **테이블 수 점검**: 원본 §16 나열 **42개 테이블**을 모두 정의했다(A:5, B:5, C:6, D:3, E:4, F:3, G:6, H:4, I:4, J:2 = **42**). **§16 목록의 모든 테이블이 누락 없이 포함됨**(아래 대조표).

#### §16 원본 목록 ↔ 본 사전 대조표(누락 점검)

`tenants`(1) · `studios`(2) · `users`(3) · `members`(6) · `leads`(7) · `staff`(8) · `roles`(4) · `permissions`(5) · `rooms`(11) · `class_templates`(12) · `class_sessions`(13) · `reservations`(14) · `waitlists`(15) · `attendance`(16) · `products`(17) · `passes`(18) · `pass_transactions`(19) · `purchases`(20) · `payments`(21) · `refunds`(22) · `revenue_records`(23) · `expense_records`(24) · `expense_categories`(25) · `bank_accounts`(27) · `bank_transactions`(28) · `card_sales`(29) · `card_expenses`(30) · `transaction_matching_rules`(31) · `transaction_reconciliation_logs`(32) · `notification_templates`(33) · `notifications`(34) · `counseling_logs`(9) · `marketing_sources`(10) · `instructor_comments`(35) · `exercise_logs`(36) · `settlements`(26) · `financial_reports`(37) · `audit_logs`(38) · `external_integrations`(39) · `sync_logs`(40) · `subscription_plans`(41) · `tenant_subscriptions`(42). → **42개 전부 매핑 완료**.

---

## 3. enum 사전 (Enum Dictionary)

> 저장값은 영문 코드, UI는 한글 라벨. **소유 테이블**에 해당 enum의 정의 권한이 있으나, 값 집합 변경은 본 문서 개정으로만 가능.

### 3.1 `member_status` (회원 상태) — 소유: `members`
| 코드 | 라벨 | 의미 |
|---|---|---|
| `new_inquiry` | 신규문의 | 최초 문의 접수 |
| `consulting` | 상담중 | 상담 진행 중 |
| `trial_booked` | 체험예약 | 체험수업 예약됨 |
| `trial_done` | 체험완료 | 체험수업 이수 |
| `enrolled` | 등록완료 | 수강권 등록(유효 회원) |
| `dormant` | 휴면 | 장기 미방문/비활성 |
| `expired` | 만료 | 수강권 만료(미재등록) |
| `re_enrolled` | 재등록완료 | 만료 후 재등록 |

### 3.2 `lead_status` (상담 상태) — 소유: `leads`
| 코드 | 라벨 |
|---|---|
| `new_inquiry` | 신규문의 |
| `contacted` | 연락완료 |
| `trial_booked` | 체험예약 |
| `trial_done` | 체험완료 |
| `enrolled` | 등록완료 |
| `on_hold` | 보류 |
| `lost` | 실패(미등록) |

### 3.3 `class_type` (수업 유형) — 소유: `class_templates`/`class_sessions`
| 코드 | 라벨 |
|---|---|
| `personal` | 1:1 개인레슨 |
| `group` | 그룹레슨 |
| `trial` | 체험수업 |

### 3.4 `session_status` (수업 회차 상태) — 소유: `class_sessions`
| 코드 | 라벨 |
|---|---|
| `scheduled` | 예정 |
| `open` | 예약가능 |
| `closed` | 예약마감 |
| `canceled` | 폐강 |
| `completed` | 종료 |

### 3.5 `reservation_status` (예약 상태) — 소유: `reservations`
| 코드 | 라벨 | 의미 |
|---|---|---|
| `booked` | 예약완료 | 정원 내 예약 확정 |
| `waitlisted` | 대기 | 정원 초과 대기(연결 `waitlists`) |
| `attended` | 출석 | 수업 참석 완료 |
| `absent` | 결석 | 사전 통보 결석 |
| `no_show` | 노쇼 | 무단 불참 |
| `canceled` | 취소 | 예약 취소(정상/지각취소 구분은 메타) |

### 3.6 `attendance_status` (출석 상태) — 소유: `attendance`
| 코드 | 라벨 |
|---|---|
| `attended` | 출석 |
| `late` | 지각 |
| `absent` | 결석 |
| `no_show` | 노쇼 |
| `excused` | 사유결석(차감면제 가능) |

### 3.7 `pass_kind` (수강권 종류) — 소유: `products`/`passes`
| 코드 | 라벨 |
|---|---|
| `personal` | 1:1권 |
| `group` | 그룹권 |
| `trial` | 체험권 |
| `package` | 패키지권 |

### 3.8 `pass_status` (수강권 상태) — 소유: `passes`
| 코드 | 라벨 |
|---|---|
| `active` | 사용중 |
| `paused` | 정지(홀딩) |
| `expired` | 만료 |
| `refunded` | 환불 |
| `used_up` | 소진완료 |

### 3.9 `pass_txn_reason` (수강권 증감 사유) — 소유: `pass_transactions`
| 코드 | 라벨 | delta 방향 |
|---|---|---|
| `deduct_booking` | 예약차감 | − |
| `deduct_attend` | 출석차감 | − |
| `restore_cancel` | 취소복구 | + |
| `restore_close` | 폐강복구 | + |
| `manual_deduct` | 수동차감 | − |
| `manual_restore` | 수동복구 | + |

> 차감 시점(예약 시 `deduct_booking` vs 출석 시 `deduct_attend`)은 스튜디오 정책(§6 `deduct_timing`)에 따라 둘 중 하나만 사용한다.

### 3.10 `payment_status` (결제 상태) — 소유: `payments`
| 코드 | 라벨 |
|---|---|
| `paid` | 결제완료 |
| `awaiting_deposit` | 입금대기 |
| `partial` | 일부입금 |
| `receivable` | 미수금 |
| `refunded` | 환불완료 |

### 3.11 `payment_method` (결제 수단) — 소유: `payments`
| 코드 | 라벨 |
|---|---|
| `card_onsite` | 현장카드 |
| `transfer` | 계좌이체 |
| `cash` | 현금 |
| `online` | 온라인결제(PG, 2~3차) |

### 3.12 `revenue_basis` (매출 인식 기준) — 소유: `revenue_records`
| 코드 | 라벨 | 정의 |
|---|---|---|
| `payment` | 결제기준 | 결제 시점에 매출 인식 (§4.1) |
| `consumption` | 소진기준 | 수업 소진(출석/차감) 시점에 인식 (§4.2) |

### 3.13 `expense_category` (비용 카테고리, 17종) — 소유: `expense_categories`
| 코드 | 라벨 | 기본 cost_type |
|---|---|---|
| `rent` | 임대료 | fixed |
| `maintenance_fee` | 관리비 | fixed |
| `payroll` | 인건비 | fixed |
| `instructor_fee` | 강사료 | variable |
| `advertising` | 광고비 | variable |
| `payment_fee` | 결제수수료 | variable |
| `supplies` | 소모품비 | variable |
| `facility` | 시설관리비 | variable |
| `utilities` | 공과금 | variable |
| `telecom` | 통신비 | fixed |
| `tax_accounting` | 세무기장료 | fixed |
| `education` | 교육비 | variable |
| `insurance` | 보험료 | fixed |
| `tax` | 세금 | variable |
| `meal` | 식대 | variable |
| `transport` | 교통비 | variable |
| `etc` | 기타 | variable |

### 3.14 `cost_type` (비용 성격) — 소유: `expense_categories`/`expense_records`
| 코드 | 라벨 |
|---|---|
| `fixed` | 고정비 |
| `variable` | 변동비 |

### 3.15 (예약) — `class_type`은 §3.3 단일 정의를 공유한다.

### 3.16 `marketing_source` (유입경로) — 소유: `marketing_sources`
| 코드 | 라벨 | is_paid |
|---|---|---|
| `naver_place` | 네이버 플레이스 | false |
| `naver_blog` | 네이버 블로그 | false |
| `instagram` | 인스타그램 | false |
| `referral` | 지인소개 | false |
| `offline` | 오프라인 | false |
| `ad` | 광고 | true |
| `etc` | 기타 | false |

### 3.17 `tag` (회원 태그) — 소유: `members`(다대다 태그)
| 코드 | 라벨 |
|---|---|
| `no_show_risk` | 노쇼주의 |
| `re_enroll_likely` | 재등록유력 |
| `long_absent` | 장기미방문 |
| `vip` | VIP |
| `trial` | 체험고객 |
| `expiring` | 만료임박 |
| `receivable` | 미수금 |

### 3.18 `role` (역할, 7종) — 소유: `roles`/`users`
| 코드 | 라벨 | 비고 |
|---|---|---|
| `saas_admin` | SaaS 최고관리자 | 글로벌(테넌트 초월) |
| `owner` | 샵 오너 | 모든 데이터 |
| `manager` | 샵 관리자 | 회원/예약/결제 입력 |
| `info_staff` | 인포 직원 | 프론트 운영 |
| `instructor` | 강사 | 담당 수업/회원 메모만 |
| `accountant` | 회계 담당자 | 매출/비용/수익분석 |
| `member` | 회원 | 본인 데이터만 |

### 3.19 `match_target` (거래 분류 대상) — 소유: `bank_transactions`/`card_expenses`/`transaction_matching_rules`
| 코드 | 라벨 |
|---|---|
| `revenue` | 매출 |
| `expense` | 비용 |
| `transfer` | 이체(내부이동) |
| `etc` | 기타 |

### 3.20 `notification_type` (알림 유형, 13종) — 소유: `notification_templates`/`notifications`
| 코드 | 라벨 |
|---|---|
| `reservation_done` | 예약 완료 |
| `reservation_reminder` | 예약 전 리마인드 |
| `reservation_canceled` | 예약 취소 |
| `waitlist_promoted` | 대기 확정 |
| `pass_expiring` | 수강권 만료 예정 |
| `pass_low_count` | 잔여횟수 부족 |
| `long_absence` | 장기 미방문 |
| `trial_guide` | 체험 전 안내 |
| `trial_followup` | 체험 후 등록 상담 |
| `re_enroll` | 재등록 |
| `receivable` | 미수금 |
| `review_request` | 리뷰 요청 |
| `counseling_reminder` | 상담 리마인드 |

### 3.21 `reconciliation_stage` (카드매출 정산 단계) — 소유: `card_sales`/`bank_transactions`
| 코드 | 라벨 | 의미 |
|---|---|---|
| `approved` | 승인 | 카드 승인 완료(승인일) |
| `captured` | 매입 | 카드사 매입 처리(매입일) |
| `deposited` | 입금 | 사업자 통장 입금(입금일, 통장거래 매칭) |

---

## 4. 이중 손익 회계 모델 (Dual Profit & Loss)

> 본 솔루션의 핵심 차별화. **모든 매출은 `revenue_records`에 두 기준(`payment`/`consumption`)으로 각각 인식**하며, 대시보드는 사용자가 기준을 토글한다. 한 결제는 결제기준 1건과, 소진될 때마다 소진기준 N건을 만든다(중복 합산 금지 — 기준별로만 합산).

### 4.1 결제 기준 (`revenue_basis = payment`)
- **정의**: 회원이 **결제한 시점**에 결제 전액을 매출로 인식. 현금흐름·단기 자금관리에 유리.
- **인식 시점**: `payments.paid_at` (또는 입금대기→입금 확정 시점). 미수금은 미인식 또는 별도 표시(스튜디오 정책 §6 `revenue_recognition`).
- **`revenue_records` 표현**: `revenue_basis='payment'`, `source_type='payment'`, `payment_id` 연결, `amount = payments.paid_amount`(실수령액), `recognized_at = paid_at`.
- **환불 반영**: `refunds` 발생 시 `revenue_basis='payment'`, `source_type='refund'`, `amount = -refund_amount`(음수)로 1건 추가 → 순매출 자동 차감.

### 4.2 수업 소진 기준 (`revenue_basis = consumption`)
- **정의**: 실제 **수업이 소진(차감)될 때마다** 단가만큼 매출 인식. 강사료·수업 원가·수익성 분석에 유리.
- **단가 산정**: `passes.unit_price_amount = round(purchases.final_amount / passes.total_count)`. 발급 시 고정(라운딩 잔차는 마지막 소진 회차 또는 별도 조정 레코드로 보정).
- **인식 시점**: `pass_transactions`의 차감(`deduct_booking` 또는 `deduct_attend`, 정책에 따름) 발생 시.
- **`revenue_records` 표현**: `revenue_basis='consumption'`, `source_type='consumption'`, `pass_transaction_id` 연결, `class_type`·`instructor_staff_id` 채움(수업유형별·강사별 수익성 산정 근거), `amount = unit_price_amount`, `recognized_at = pass_transaction.created_at`.
- **환불 반영**: 환불로 잔여횟수 복구(`restore`) 시 **미소진분은 애초에 소진 인식되지 않았으므로** 소진기준 매출에 자동으로 빠진다. 이미 소진(차감)된 분에 대한 환불은 정책상 통상 환불 대상이 아니나, 소급 조정이 필요하면 `source_type='refund'`, `amount` 음수 소진 조정 레코드로 보정.

### 4.3 두 기준 비교(요약)
| 구분 | 결제기준 | 소진기준 |
|---|---|---|
| 인식 시점 | 결제 시 | 수업 소진 시 |
| 1결제당 레코드 | 1건(+환불 음수) | 총횟수 N건(회차별) |
| 강사/수업유형 분해 | 불가(상품 단위) | 가능 |
| 미수금 처리 | 별도 표시 | 미소진=미인식 |
| 활용 | 현금흐름·자금 | 원가·수익성 |

### 4.4 회계 산식(공유 정의 — `19-metrics.md`가 상세 소유)
- 순매출 = Σ`revenue_records.amount`(선택 basis) (환불 음수 포함)
- 총비용 = Σ`expense_records.amount`
- 고정비/변동비 = `cost_type`별 합
- 영업이익 = 순매출 − 총비용 / 영업이익률 = 영업이익 ÷ 순매출
- 미입금 카드매출 = Σ`card_sales.net_deposit_amount` where `reconciliation_stage != deposited`
- 미수금 = Σ`payments.receivable_amount` where `payment_status in (receivable, partial)`

---

## 5. RBAC 매트릭스 스켈레톤 (상세는 `13-rbac.md`)

> 원칙: **테넌트/스튜디오 격리(모든 비-saas 역할은 자기 `studio_id` 범위)** + 리소스×액션×스코프. 강사는 전체 매출·통장 잔액 접근 불가. 회원은 본인 데이터만. **모든 수정/삭제/환불/수강권 차감은 `audit_logs` 필수.** 스코프: `all`(스튜디오 전체) / `assigned`(담당) / `own`(본인).

| 리소스 \ 역할 | saas_admin | owner | manager | info_staff | instructor | accountant | member |
|---|---|---|---|---|---|---|---|
| 테넌트/스튜디오 설정 | CRUD(all) | RU(own studio) | R | – | – | – | – |
| 사용자/역할 | CRUD(global) | CRUD | R | – | – | – | – |
| 회원/리드(CRM) | R | CRUD | CRUD | CRUD | R(assigned) | R | R(own) |
| 수업/예약/출석 | R | CRUD | CRUD | CRUD | RU(assigned 수업) | R | RU(own 예약) |
| 수강권/차감 | R | CRUD | CRUD | C/R | R(assigned) | R | R(own) |
| 결제/환불 | R | CRUD | CRU | C/R | – | R | R(own) |
| 매출/수익분석 | R(global) | R(all) | R(요약) | – | R(assigned 매출만) | R(all) | – |
| 비용/정산 | R | CRUD | – | – | R(본인 정산) | CRUD | – |
| 통장/카드/매칭 | R | RU | – | – | – | CRUD | – |
| 통장 잔액 | R | R | – | – | **불가** | R | – |
| 강사 코멘트/운동일지 | R | CRUD | R | R | CRUD(assigned) | – | R(own) |
| 알림 | R | CRUD | CRU | CRU | – | – | R(own) |
| 감사로그 | R | R | – | – | – | R | – |
| SaaS 과금/구독 | CRUD | R(own) | – | – | – | – | – |

(C=생성, R=조회, U=수정, D=삭제. `–`=접근 불가. 셀의 스코프 한정은 괄호로 표기.)

---

## 6. 정책 파라미터 기본값 (스튜디오별 설정, `studios.policy_json`)

> 아래는 **시스템 기본값**이며 스튜디오별로 오버라이드한다. 수업 단위(`class_templates`)에서 다시 오버라이드 가능. 상세 적용 규칙은 `14-booking-policy.md` · `15-pass-policy.md` · `16-payment-refund-policy.md`가 소유.

### 6.1 예약/취소/노쇼/차감
| 파라미터 | 키 | 기본값 | 설명 |
|---|---|---|---|
| 예약 오픈일 | `booking_open_days` | 14일 | 수업 시작 며칠 전부터 예약 가능 |
| 예약 마감(분) | `booking_close_minutes` | 60분 | 수업 시작 N분 전 예약 마감 |
| 취소 마감(분) | `cancel_deadline_minutes` | 120분 | 시작 N분 전까지 무차감 취소 가능 |
| 1일 예약 한도 | `daily_booking_limit` | 1회 | 회원 1인 1일 최대 예약 수 |
| 차감 시점 | `deduct_timing` | `on_attend` | `on_booking`(예약 시) / `on_attend`(출석 시) |
| 노쇼 차감 | `no_show_deduct` | true | 노쇼 시 횟수 차감 |
| 지각취소 차감 | `late_cancel_deduct` | true | 취소마감 이후 취소 시 차감 |
| 대기 자동전환 | `waitlist_auto_promote` | true | 결원 발생 시 대기 1순위 자동 확정 |
| 대기 확정 응답시한(분) | `waitlist_promote_ttl_minutes` | 30분 | 자동전환 후 무응답 시 다음 순번 |
| 자동 폐강 최소인원 | `auto_close_min_count` | 1명 | 미만 시 자동 폐강 후보 |

### 6.2 수강권
| 파라미터 | 키 | 기본값 | 설명 |
|---|---|---|---|
| 정지 가능 여부 | `holdable` | true | 홀딩(일시정지) 허용 |
| 최대 정지일 | `max_hold_days` | 30일 | 누적 정지 한도 |
| 만료 연장 허용 | `extend_allowed` | true | 만료일 연장 가능 |
| 잔여 부족 알림 임계 | `low_count_threshold` | 2회 | 이하 시 알림 발송 |
| 만료 임박 알림(일) | `expiring_alert_days` | 7일 | 만료 N일 전 알림 |

### 6.3 결제/환불
| 파라미터 | 키 | 기본값 | 설명 |
|---|---|---|---|
| 매출 인식 방식 | `revenue_recognition` | `on_paid` | 결제기준 인식 시점(`on_paid`/`on_deposit`) |
| 미수 허용 | `allow_receivable` | true | 미수금 발생 허용 |
| 환불 위약 공제율 | `refund_penalty_rate` | 0.10 | 환불 시 위약금 비율(정책별) |
| 환불 단가 산정 | `refund_unit_basis` | `list_price` | 사용분 공제 단가(정가/실판매가) |
| 카드수수료율 | `card_fee_rate` | 0.023 | 카드매출 수수료 추정율 |

### 6.4 알림
| 파라미터 | 키 | 기본값 |
|---|---|---|
| 예약 리마인드 시점(분) | `reminder_before_minutes` | 1440분(24h) |
| 장기 미방문 기준(일) | `long_absence_days` | 21일 |
| 기본 채널 | `default_channel` | `sms`(2차: `kakao`) |

---

## 7. 문서 맵 (Document Map) — 각 문서의 소유 범위

> 각 enum/테이블의 **정의 권한(owner)** 은 본 00-canon에 있고, 후속 문서는 이를 **상세화·시각화**할 뿐 정의를 바꿀 수 없다. 아래 "소유 범위"는 해당 문서가 1차로 책임지는 영역이다.

| 문서 | 제목 | 소유 enum/테이블·정책 범위 |
|---|---|---|
| `00-canon.md` | 단일 진실원천 | **전체 스키마/enum/RBAC/회계모델/네이밍/정책 기본값(SSOT)** |
| `01-overview.md` | 서비스 개요 | 콘셉트·목표·범위(정의 없음) |
| `02-personas.md` | 페르소나 | `role`(§3.18) 활용 |
| `03-scenarios.md` | 시나리오 | 상태 전이(member_status/lead_status/reservation_status) 흐름 |
| `04-feature-catalog.md` | 기능 목록 | 전 모듈 매핑(테이블↔기능) |
| `05-scope-mvp.md` | MVP 범위 | MVP 테이블/기능 셀렉션 |
| `06-scope-phases.md` | 2/3차 확장 | bank_*·card_*·external_integrations·subscription_* |
| `07-ia.md` | 화면 IA | 리소스↔화면 매핑 |
| `08-wireframes.md` | 와이어프레임 | 화면별 필드(컬럼 참조) |
| `09-admin-dashboard.md` | 관리자 대시보드 | 4영역 지표(오늘운영/매출/비용/수익) |
| `10-profit-dashboard.md` | 수익분석 대시보드 | `revenue_basis` 토글 UI·이중 손익 시각화 |
| `11-erd.md` | ERD 초안 | **전 테이블 상세 컬럼/인덱스/제약**(본 §2 준수) |
| `12-api.md` | API 명세 | 엔드포인트(리소스 enum/스코프 준수) |
| `13-rbac.md` | 권한 정책 | **RBAC 상세 매트릭스**(본 §5 확장), `roles`/`permissions` |
| `14-booking-policy.md` | 예약/취소/노쇼/차감 | reservation_status·attendance_status·§6.1 정책 |
| `15-pass-policy.md` | 수강권 정책 | pass_kind·pass_status·pass_txn_reason·§6.2 |
| `16-payment-refund-policy.md` | 결제/환불 정책 | payment_status·payment_method·refunds·§6.3 |
| `17-reconciliation-policy.md` | 거래 매칭 정책 | match_target·reconciliation_stage·매칭규칙 |
| `18-expense-category-policy.md` | 비용 카테고리 정책 | expense_category(17)·cost_type·자동분류 규칙 |
| `19-metrics.md` | 수익분석 지표 정의 | revenue_basis 산식·CAC/LTV/전환율(§4.4 확장) |
| `20-saas-architecture.md` | SaaS 아키텍처 | tenants/studios/subscription_*·테넌시 격리 |
| `21-roadmap.md` | 개발 우선순위 | MVP/2차/3차 일정 |
| `22-qa-checklist.md` | QA 체크리스트 | 상태전이·금액·권한 검증 항목 |
| `23-risks.md` | 운영 리스크 | 금융연동·정합성·권한 리스크 |

---

## 8. 변경 관리

- 본 문서를 변경하면 **버전·기준일**을 갱신하고, 영향받는 후속 문서를 동기화한다.
- enum 값/테이블 컬럼/정책 기본값의 추가·삭제는 **반드시 본 문서를 먼저** 수정한다.
- 후속 문서가 본 계약과 충돌하면 **본 문서가 우선**한다.
