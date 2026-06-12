# 03-scenarios.md — 사용자별 주요 시나리오

> **목적**: 핵심 사용자(원장·관리자/인포·강사·회계담당자·회원·잠재고객)의 end-to-end 업무 흐름을 **트리거 → 행동 → 화면 → 데이터변화 → 알림** 5단계로 구체화하여, 후속 설계 문서(IA·와이어프레임·API·정책)가 동일한 흐름을 공유하도록 한다.

본 문서는 [`00-canon.md`](./00-canon.md)(SSOT)의 테이블명·컬럼명·enum 코드·역할명·정책 파라미터를 **글자 단위로** 따른다. 모든 상태값은 영문 코드(snake_case)로 저장되며, 괄호 안 한글은 UI 라벨이다. 금액은 정수(원), 시각은 `_at`(UTC), 날짜는 `_date`(KST) 규약을 따른다.

## 표기 약속

- **데이터변화** 칸은 `테이블`.`컬럼` = 값 형태로 기록한다. INSERT는 "신규 행", UPDATE는 "컬럼 변경"으로 표기.
- **알림** 칸은 `notifications` INSERT + `notification_type`(§3.20) 코드로 표기.
- **감사** 표기가 있는 단계는 `audit_logs`에 `action`이 기록된다(모든 수정/삭제/환불/수강권 차감 — [00-canon §5](./00-canon.md) 필수 규칙).
- 정책 파라미터는 `studios.policy_json`(§6) 기본값을 사용한다: `cancel_deadline_minutes=120`, `deduct_timing=on_attend`, `no_show_deduct=true`, `late_cancel_deduct=true`, `waitlist_auto_promote=true`, `waitlist_promote_ttl_minutes=30`, `low_count_threshold=2`, `expiring_alert_days=7`, `long_absence_days=21`, `refund_penalty_rate=0.10`, `card_fee_rate=0.023`, `max_hold_days=30`.

---

## 시나리오 1 — 상담 → 체험예약 → 체험완료 → 등록 전환 (CRM 퍼널)

**주체**: 잠재 상담 고객(전화/DM 문의) → `info_staff`(인포 직원) / `manager`(관리자)
**핵심 차별점**: 문의 1건이 `leads`로 시작해 `members`로 승격되며, 유입경로별 전환율·매출의 근거 데이터가 단계마다 쌓인다.

| # | 트리거 | 행동 | 화면 | 데이터변화 | 알림 |
|---|---|---|---|---|---|
| 1 | 인스타 DM "체험 문의" 접수 | 인포가 신규 문의 등록. 이름·연락처·유입경로 입력 | CRM > 상담 파이프라인 > 신규 문의 등록 | `leads` 신규 행: `lead_status='new_inquiry'`(신규문의), `marketing_source='instagram'`(인스타그램), `inquiry_date`=오늘, `assigned_staff_id`=담당 인포. 동시에 `members` 신규 행: `member_status='new_inquiry'`(신규문의), `marketing_source='instagram'`. `leads.member_id`로 연결 | — |
| 2 | 인포가 전화 통화로 일정 조율 | 상담 이력 1건 기록, 다음 액션 예약 | CRM > 회원 상세 > 상담 탭 | `counseling_logs` 신규 행: `channel='call'`, `content`="체험 일정 조율", `consulted_at`=now, `next_action_at`=체험 1시간 전. `leads.lead_status='contacted'`(연락완료) | `notifications`: `counseling_reminder`(상담 리마인드) 예약(`scheduled_at=next_action_at`) |
| 3 | 고객이 체험수업 일자 확정 | 인포가 체험수업 회차에 대리 예약 | 수업 캘린더 > 체험 회차 > 예약 추가 | `reservations` 신규 행: `class_session_id`=체험 회차, `member_id`, `reservation_status='booked'`(예약완료), `is_self_booked=false`. 체험권 미보유 시 `passes`에 `pass_kind='trial'`(체험권) 임시 발급. `leads.lead_status='trial_booked'`(체험예약), `leads.trial_booked_date`=오늘. `members.member_status='trial_booked'`(체험예약) | `notifications`: `trial_guide`(체험 전 안내), `reservation_done`(예약 완료) |
| 4 | 체험수업 당일 출석 | 강사/인포가 출석 체크 | 강사 출석 화면 또는 인포 출석 보드 | `attendance` 신규 행: `attendance_status='attended'`(출석), `deducted=true`. 체험권 `pass_transactions`: `reason='deduct_attend'`(출석차감), `delta=-1`. `leads.lead_status='trial_done'`(체험완료), `leads.trial_done_date`=오늘. `members.member_status='trial_done'`(체험완료) | `notifications`: `trial_followup`(체험 후 등록 상담) — 정책상 체험 후 D+1 발송 예약 |
| 5 | 고객이 8회 그룹권 등록 결정 | 관리자가 상품 선택 → 결제 입력 → 수강권 발급(시나리오 4 흐름) | 회원 상세 > 수강권 등록 | `purchases`/`payments`/`passes` 생성(시나리오 4 참조). `leads.lead_status='enrolled'`(등록완료), `leads.enrolled_date`=오늘. `members.member_status='enrolled'`(등록완료). `revenue_records`에 결제기준·소진기준 인식 시작 | `notifications`: `reservation_done` 등 후속 |
| 6 | (전환 실패 케이스) 고객 미응답 2주 | 인포가 상담 종결 처리 | CRM > 상담 파이프라인 | `leads.lead_status='lost'`(실패), `leads.lost_reason`="가격 부담". `members.member_status='dormant'`(휴면) 또는 유지 | — |

**전환 지표 산출 근거**: 체험 등록전환율 = `leads`에서 `enrolled_date IS NOT NULL` ÷ `trial_done_date IS NOT NULL`. 유입경로별 전환율은 `marketing_source` 그룹핑. (상세: [19-metrics.md](./19-metrics.md))

---

## 시나리오 2 — 회원 모바일 웹 예약 / 취소 / 대기 신청

**주체**: 기존 회원(`member` 역할, 본인 데이터만)
**UX 목표**: 모바일 웹에서 예약 30초 이내 완료([00-canon §7 / 원본 §18](./00-canon.md)).

### 2-A. 정상 예약 (정원 여유)

| # | 트리거 | 행동 | 화면 | 데이터변화 | 알림 |
|---|---|---|---|---|---|
| 1 | 회원이 모바일 웹 로그인(SMS 인증) | 이번 주 예약 가능 수업 조회 | 모바일 > 예약하기 > 캘린더 | 조회만. `class_sessions`에서 `session_status='open'`(예약가능) AND `start_at` 정책 윈도우 내(예약 오픈 `booking_open_days=14`, 마감 `booking_close_minutes=60`) 필터 | — |
| 2 | 회원이 수/19:00 그룹수업 선택 | 보유 수강권 자동 선택 후 "예약" 탭 | 모바일 > 회차 상세 | 잔여석 확인: `reservations` 중 `reservation_status='booked'` count < `class_sessions.capacity` | — |
| 3 | "예약" 확정 | 예약 생성 | 모바일 > 예약 완료 | `reservations` 신규 행: `reservation_status='booked'`(예약완료), `member_id`, `pass_id`, `is_self_booked=true`, `booked_at`=now. **차감 시점 정책 `deduct_timing=on_attend`이므로 이 시점엔 횟수 미차감**(출석 시 차감) | `notifications`: `reservation_done`(예약 완료) 즉시 + `reservation_reminder`(예약 전 리마인드) 예약(`reminder_before_minutes=1440`, 수업 24h 전) |

### 2-B. 취소 (취소마감 전/후 분기)

| # | 트리거 | 행동 | 화면 | 데이터변화 | 알림 |
|---|---|---|---|---|---|
| 4a | 수업 4시간 전 취소(마감 전) | "예약 취소" | 모바일 > 내 예약 | `cancel_deadline_minutes=120` 이내 아님 → **무차감 취소**. `reservations.reservation_status='canceled'`(취소), `canceled_at`, `cancel_reason`. `deduct_timing=on_attend`라 차감 자체가 없었으므로 복구 불필요 | `notifications`: `reservation_canceled`(예약 취소). 대기자 있으면 시나리오 3 트리거 |
| 4b | 수업 1시간 전 취소(마감 후, 지각취소) | "예약 취소" | 모바일 > 내 예약 | `late_cancel_deduct=true` → 지각취소 차감. `reservations.reservation_status='canceled'`. `pass_transactions`: `reason='manual_deduct'`(수동차감) 또는 정책상 지각취소 차감 1건, `delta=-1`, `balance_after` 갱신. **감사**: `audit_logs.action='pass_adjust'` | `notifications`: `reservation_canceled`. 잔여 임계 도달 시 `pass_low_count` |

> 참고: `deduct_timing=on_booking` 정책을 쓰는 스튜디오라면 예약 시 즉시 `deduct_booking`(예약차감)으로 −1, 마감 전 취소 시 `restore_cancel`(취소복구) +1로 복구한다. 본 기본 시나리오는 `on_attend`(출석 시 차감) 기준이다.

### 2-C. 대기 신청 (정원 마감)

| # | 트리거 | 행동 | 화면 | 데이터변화 | 알림 |
|---|---|---|---|---|---|
| 5 | 정원 8/8 마감된 수업 선택 | "대기 신청" | 모바일 > 회차 상세(대기 버튼만 활성) | `waitlists` 신규 행: `class_session_id`, `member_id`, `pass_id`, `position`=마지막+1, `status='waiting'`(대기), `requested_at`=now. `reservations`는 `reservation_status='waitlisted'`(대기)로 보조 기록 가능 | — (대기 등록 자체는 무알림. 전환 시 알림은 시나리오 3) |

---

## 시나리오 3 — 대기자 자동 전환 (결원 → 자동 확정)

**주체**: 시스템(스케줄러/이벤트) + 대기 회원
**정책**: `waitlist_auto_promote=true`, `waitlist_promote_ttl_minutes=30`.

| # | 트리거 | 행동(시스템) | 화면 | 데이터변화 | 알림 |
|---|---|---|---|---|---|
| 1 | 시나리오 2-B의 결원 발생(예약 취소) | 시스템이 해당 `class_session_id`의 대기 큐 1순위 조회 | (백그라운드) | `waitlists`에서 `status='waiting'` AND 최소 `position` 1건 선택 | — |
| 2 | 1순위 자동 전환 | 대기 → 예약 승격 | (백그라운드) | 선택 행 `waitlists.status='promoted'`(전환), `promoted_at`=now. `reservations` 신규/갱신: `reservation_status='booked'`(예약완료). `deduct_timing=on_attend`라 횟수는 출석 시 차감 | `notifications`: `waitlist_promoted`(대기 확정) 즉시 발송 |
| 3 | 전환 응답시한(TTL) 카운트 시작 | `promoted_at + 30분` 타이머 | 모바일 > 내 예약(확정 표시) | — | 리마인드(선택) |
| 4a | 회원이 TTL 내 유지(자동 확정 유지) | 별도 행동 불필요(자동 확정 모델) | — | 변화 없음 | — |
| 4b | (정책상 명시적 수락 모델일 때) TTL 무응답 | 다음 순번으로 이월 | (백그라운드) | 1순위 `waitlists.status='expired'`(만료), 해당 `reservations.reservation_status='canceled'`. 2순위 `status='promoted'` 승격 후 재알림 | `notifications`: 2순위에게 `waitlist_promoted` |
| 5 | 대기 회원이 직접 대기 취소 | "대기 취소" | 모바일 > 내 예약 | `waitlists.status='canceled'`(취소) | — |

> **무결성 규칙**: 자동 전환 시 정원 초과가 발생하지 않도록 `reservations`의 `booked` 카운트와 `class_sessions.capacity`를 트랜잭션 내에서 재검증한다(상세 [14-booking-policy.md](./14-booking-policy.md)).

---

## 시나리오 4 — 관리자 대리예약 + 결제입력 + 수강권 부여 (3클릭 흐름)

**주체**: `manager`(관리자) / `info_staff`(인포)
**UX 목표**: 회원 등록·예약 변경·수강권 부여·결제 입력을 3번 클릭 이내([00-canon §7 / 원본 §18](./00-canon.md)).

### 4-A. 수강권 등록 + 결제 입력 (현장 카드)

| # | 클릭/트리거 | 행동 | 화면 | 데이터변화 | 알림 |
|---|---|---|---|---|---|
| 1 | **클릭 1** | 회원 상세에서 "수강권 등록" → 상품 선택(예: 그룹 8회권, `price_amount=240,000`) | 회원 상세 > 수강권 등록 모달 | `products` 조회(`pass_kind='group'`, `total_count=8`, `valid_days=60`, `price_amount=240000`) | — |
| 2 | **클릭 2** | 결제수단=현장카드, 할인 0, 승인번호 입력 | 동일 모달 > 결제 정보 | `purchases` 신규 행: `list_amount=240000`, `discount_amount=0`, `final_amount=240000`, `seller_staff_id`. `payments` 신규 행: `payment_status='paid'`(결제완료), `payment_method='card_onsite'`(현장카드), `amount=240000`, `paid_amount=240000`, `card_approval_no`, `receivable_amount=0`, `paid_at`=now | — |
| 3 | **클릭 3** | "등록 확정" | 동일 모달 > 확정 | `passes` 신규 행: `pass_kind='group'`(그룹권), `total_count=8`, `remaining_count=8`, `start_date`=오늘, `expire_date`=오늘+60일, `pass_status='active'`(사용중), `unit_price_amount=round(240000/8)=30000`(소진기준 단가, §4.2). `members.member_status='enrolled'`(등록완료). **revenue 인식 시나리오 6 참조**. **감사**: `audit_logs.action='create'` | (선택) 등록 안내 |

**카드매출 추적 연동**: 현장 카드결제이므로 `card_sales` 신규 행이 함께 생성될 수 있다: `payment_id` 연결, `amount=240000`, `approved_at`=now, `reconciliation_stage='approved'`(승인), `fee_amount=round(240000×0.023)=5520`, `net_deposit_amount=234480`. 매입·입금은 후일 시나리오 7에서 매칭.

### 4-B. 대리 예약 (관리자가 회원 대신)

| # | 트리거 | 행동 | 화면 | 데이터변화 | 알림 |
|---|---|---|---|---|---|
| 4 | 회원 전화로 "수요일 예약 잡아달라" | 캘린더에서 회차 선택 → 예약 추가 | 수업 캘린더 > 회차 > 예약 추가 | `reservations` 신규 행: `reservation_status='booked'`, `is_self_booked=false`(대리), `pass_id`=방금 발급한 그룹권 | `notifications`: `reservation_done`, `reservation_reminder` 예약 |

### 매출 인식 즉시 처리 (시나리오 6과 연결)

결제 확정 시점(`payments.paid_at`)에 **결제기준** `revenue_records` 1건 자동 생성:

```
revenue_records (결제기준)
  revenue_basis      = 'payment'        -- 결제기준
  source_type        = 'payment'
  payment_id         = <위 payments.id>
  product_id         = <그룹 8회권>
  amount             = 240000           -- paid_amount 전액
  recognized_at      = paid_at
  recognized_date    = 2026-06-12 (KST)
  is_new_member      = true
  is_re_enroll       = false
```

소진기준은 결제 시점엔 0원이며, 출석/차감 시마다 30,000원씩 인식된다(시나리오 5·6).

---

## 시나리오 5 — 출석 / 결석 / 노쇼 처리와 차감

**주체**: `instructor`(강사, 담당 수업) / `info_staff`(인포)
**정책**: `deduct_timing=on_attend`(출석 시 차감), `no_show_deduct=true`(노쇼 차감), 사유결석(`excused`)은 차감 면제 가능.

수업 1회차(그룹, 예약 8명)에서 세 가지 케이스를 동시에 처리한다.

| # | 트리거 | 행동 | 화면 | 데이터변화 (회원별) | 알림 |
|---|---|---|---|---|---|
| 1 | 수업 시작, 출석 보드 오픈 | 강사가 출석 화면 진입 | 강사 > 오늘 수업 > 출석체크 | 예약자 8명 로드(`reservation_status='booked'`) | — |
| 2 | A회원 정상 참석 | "출석" 탭 | 출석 보드 | `attendance` 신규: `attendance_status='attended'`(출석), `deducted=true`, `checked_by`. `reservations.reservation_status='attended'`(출석). `pass_transactions`: `reason='deduct_attend'`(출석차감), `delta=-1`, `balance_after=remaining-1`. `passes.remaining_count` −1 | 잔여 `low_count_threshold=2` 이하면 `pass_low_count`(잔여횟수 부족) |
| 3 | B회원 사전통보 결석 | "결석(사유)" 탭 | 출석 보드 | `attendance` 신규: `attendance_status='excused'`(사유결석), `deducted=false`. `reservations.reservation_status='absent'`(결석). **차감 없음**(`excused`는 면제) | — |
| 4 | C회원 무단 불참 | "노쇼" 탭 | 출석 보드 | `attendance` 신규: `attendance_status='no_show'`(노쇼), `deducted=true`(∵`no_show_deduct=true`). `reservations.reservation_status='no_show'`(노쇼). `pass_transactions`: `reason='deduct_attend'`(출석차감 — 노쇼 차감도 동일 차감 원장), `delta=-1`. **감사**: `audit_logs.action='pass_adjust'`. 회원에 `tag='no_show_risk'`(노쇼주의) 자동 부여 후보 | (선택) — |
| 5 | D회원 지각 후 참석 | "지각" 탭 | 출석 보드 | `attendance` 신규: `attendance_status='late'`(지각), `deducted=true`. `reservations.reservation_status='attended'`. 차감 1회(정상 출석과 동일) | — |
| 6 | 출석 보드 저장 | "수업 종료" | 출석 보드 | `class_sessions.session_status='completed'`(종료) | — |

**소진기준 매출 동시 인식**: 차감(`deduct_attend`)이 발생한 A·C·D 3명에 대해 각각 `revenue_records` 소진기준 1건 생성:

```
revenue_records (소진기준)  -- 회원 1명당 1건, 차감 시점
  revenue_basis        = 'consumption'   -- 소진기준
  source_type          = 'consumption'
  pass_transaction_id  = <해당 차감 원장>
  class_type           = 'group'         -- 수업유형별 수익성 근거
  instructor_staff_id  = <담당 강사>      -- 강사별 수익성 근거
  amount               = 30000           -- passes.unit_price_amount
  recognized_at        = pass_transaction.created_at
```

> B회원(사유결석)은 미차감이므로 소진기준 매출에 잡히지 않는다 → 소진기준은 "실제 소비된 수업만" 인식한다는 원칙([00-canon §4.2](./00-canon.md))을 그대로 반영.

---

## 시나리오 6 — 원장 월말 손익 점검 (결제기준 / 소진기준 토글)

**주체**: `owner`(원장) / `accountant`(회계 담당자)
**UX 목표**: 대시보드에서 오늘 운영 + 이번 달 수익을 10초 내 파악([00-canon §7](./00-canon.md)).
**핵심 차별점**: 동일 화면에서 **결제기준 ↔ 소진기준** 토글로 두 손익을 즉시 비교.

| # | 트리거 | 행동 | 화면 | 데이터변화/조회 | 알림 |
|---|---|---|---|---|---|
| 1 | 월말, 원장 로그인 | 수익분석 대시보드 진입 | 수익분석 대시보드 ([10-profit-dashboard.md](./10-profit-dashboard.md)) | 기본 `revenue_basis='payment'`(결제기준)으로 집계 | — |
| 2 | 결제기준 본다 | 상단 토글 "결제기준" | 동일 | 순매출 = Σ`revenue_records.amount` where `revenue_basis='payment'`(환불 음수 포함). 현금흐름 관점 | — |
| 3 | 소진기준으로 전환 | 토글 "소진기준" 클릭 | 동일(숫자만 변경) | 순매출 = Σ`revenue_records.amount` where `revenue_basis='consumption'`. 강사별·수업유형별 분해 가능 | — |
| 4 | 비용·이익 확인 | 비용 영역 스크롤 | 대시보드 ④ 이번 달 수익 | 총비용=Σ`expense_records.amount`; 고정비/변동비=`cost_type`별 합; 영업이익=순매출−총비용 | — |
| 5 | 미입금·미수 점검 | 현금 영역 카드 | 동일 | 미입금 카드매출=Σ`card_sales.net_deposit_amount` where `reconciliation_stage != 'deposited'`; 미수금=Σ`payments.receivable_amount` where `payment_status in ('receivable','partial')` | — |
| 6 | 월말 리포트 내보내기 | "리포트 생성/내보내기" | 리포트 > 월별 손익 | `financial_reports` 신규 행: `report_type='monthly_pl'`, `revenue_basis`=선택 기준, `period_start_date`/`period_end_date`, `data_json`, `export_file_url`. **감사**: `audit_logs.action='export'` | — |

### 두 기준 비교 예시 (6월, 그룹 8회권 240,000원 1건 가정)

| 항목 | 결제기준(`payment`) | 소진기준(`consumption`) | 설명(비전문가용) |
|---|---|---|---|
| 인식 시점 | 6/12 결제일 1건 | 출석할 때마다 1건 | 결제기준은 "돈 들어온 날", 소진기준은 "수업 쓴 날" |
| 6월 인식액 | 240,000원(전액) | 90,000원(3회 출석 × 30,000) | 소진기준은 아직 5회분(150,000원)이 "미래 매출"로 남음 |
| 강사 귀속 | 불가(상품 단위) | 가능(`instructor_staff_id`) | 강사료·수업 원가 계산엔 소진기준이 정확 |
| 환불 처리 | `source_type='refund'` 음수 1건 | 미소진분은 애초에 미인식 | [00-canon §4](./00-canon.md) |

**원장용 한 줄 해설(화면 툴팁)**: "결제기준 매출이 높고 소진기준 매출이 낮다 = 회원이 돈은 냈지만 수업을 아직 안 썼다 = 앞으로 제공해야 할 수업(부채성 선수금)이 많다는 뜻."

---

## 시나리오 7 — 회계담당자 통장·카드 CSV 업로드 → 자동추천 매칭 → 분류

**주체**: `accountant`(회계 담당자)
**핵심 차별점**: 금액/날짜/이름 기준 자동 추천 매칭 + 거래처명 규칙 학습(한 번 수정한 분류는 다음 거래부터 자동 적용 — [00-canon §3.19 / 원본 §18](./00-canon.md)).

### 7-A. 통장 거래내역 CSV 업로드 → 입금 매칭

| # | 트리거 | 행동 | 화면 | 데이터변화 | 알림 |
|---|---|---|---|---|---|
| 1 | 월초, 통장 CSV 확보 | CSV 업로드 | 정산 > 거래내역 > 통장 업로드 | `bank_transactions` 다건 신규: `txn_date`, `amount`(입금+/출금−), `direction`(deposit/withdraw), `counterparty_name`, `balance_after_amount`, `is_matched=false`, `import_batch_id` 공통 | — |
| 2 | 입금 건 자동 추천 | 시스템이 회원명·금액 매칭 추천 | 거래내역 > 미매칭 입금 | "홍길동 240,000 입금" → `payments` 중 `depositor_name`/`amount` 근접 건 추천. `match_target='revenue'`(매출) 후보 | — |
| 3 | 추천 수락 | "이 결제와 매칭" | 매칭 모달 | `bank_transactions.is_matched=true`, `match_target='revenue'`, `matched_ref_type='payment'`, `matched_ref_id`. 해당 `payments`가 입금대기였다면 `payment_status='paid'`(결제완료), `paid_amount`=입금액, `receivable_amount` 재계산. `transaction_reconciliation_logs`: `action='manual_matched'`, `before_json`/`after_json`, `staff_id`. **감사**: `audit_logs.action='match'` | — |
| 4 | 출금 건(임대료) 분류 | "비용으로 분류" | 거래내역 > 미매칭 출금 | `bank_transactions.match_target='expense'`. `expense_records` 신규: `expense_category='rent'`(임대료), `cost_type='fixed'`(고정비), `amount`, `vendor_name`, `expense_date`, `source='bank'`, `bank_transaction_id` 연결 | — |
| 5 | 내부 이체 분류 | "이체로 분류" | 거래내역 | `bank_transactions.match_target='transfer'`(이체) — 손익 미반영 | — |

### 7-B. 카드 사용내역 CSV 업로드 → 자동 카테고리 + 규칙 학습

| # | 트리거 | 행동 | 화면 | 데이터변화 | 알림 |
|---|---|---|---|---|---|
| 6 | 사업자 카드 CSV 확보 | CSV 업로드 | 정산 > 거래내역 > 카드 업로드 | `card_expenses` 다건 신규: `card_no_masked`, `vendor_name`, `amount`, `used_at`, `is_matched=false`, `import_batch_id` | — |
| 7 | 기존 규칙 자동 적용 | 시스템이 거래처명 규칙 매칭 | (백그라운드) | `transaction_matching_rules`에서 `match_field='vendor_name'`, `match_type='contains'`, `pattern` 일치 시 자동 분류. 예: "스타벅스"→`expense_category='meal'`(식대). `card_expenses.expense_record_id` 자동 생성, `is_matched=true`. 로그 `action='auto_matched'` | — |
| 8 | 미분류 신규 거래처 수동 분류 | "○○광고대행 → 광고비" 선택 + "규칙으로 저장" | 거래내역 > 미매칭 카드 | `card_expenses.match_target='expense'`, `expense_record_id` 생성(`expense_category='advertising'`(광고비), `cost_type='variable'`(변동비)). **규칙 생성**: `transaction_matching_rules` 신규 행(`pattern`="○○광고", `target_match='expense'`, `expense_category='advertising'`, `cost_type='variable'`, `priority`, `is_active=true`, `created_by`) → **다음 업로드부터 자동 적용**. 로그 `action='manual_matched'` + 후속 `reclassified` 가능 | — |
| 9 | 분류 결과 검토 | 비용 대시보드 확인 | 비용 대시보드 ([18-expense-category-policy.md](./18-expense-category-policy.md)) | 카테고리별·`cost_type`별 합계 자동 갱신 | — |

### 7-C. 카드매출 입금 대조 (3단계: 승인→매입→입금)

| # | 트리거 | 행동 | 화면 | 데이터변화 | 알림 |
|---|---|---|---|---|---|
| 10 | 카드사 입금이 통장에 찍힘 | 입금 거래를 카드매출과 대조 | 정산 > 카드매출 입금대조 | 시나리오 4의 `card_sales`(`reconciliation_stage='approved'`)를 통장 입금건과 매칭 → `card_sales.reconciliation_stage='deposited'`(입금), `deposited_at`, `bank_transaction_id` 연결. 해당 `bank_transactions.reconciliation_stage='deposited'`. 미입금 카드매출 집계에서 제외 | — |

> **미입금 카드매출** = Σ`card_sales.net_deposit_amount` where `reconciliation_stage != 'deposited'`. 원장 대시보드(시나리오 6 #5)와 동일 산식을 공유한다([00-canon §4.4](./00-canon.md)).

---

## 시나리오 8 — 강사 수업 출석체크 + 회원 코멘트

**주체**: `instructor`(강사) — **권한 한정: 담당 수업·담당 회원 메모만, 전체 매출·통장 잔액 접근 불가**([00-canon §5 RBAC](./00-canon.md)).

| # | 트리거 | 행동 | 화면 | 데이터변화 | 알림 |
|---|---|---|---|---|---|
| 1 | 강사 로그인 | 오늘 담당 수업만 표시 | 강사 > 오늘 수업 | `class_sessions` where `instructor_staff_id`=본인 AND `start_at` 오늘. RBAC `scope='assigned'` 강제 | — |
| 2 | 수업 출석 처리 | 출석/지각/결석/노쇼 체크 | 강사 > 출석체크 | 시나리오 5와 동일 데이터 흐름(`attendance` + `pass_transactions` 차감) | `pass_low_count` 등 자동 |
| 3 | 회원 수업 코멘트 작성 | "코멘트 남기기" | 강사 > 회원 > 코멘트 | `instructor_comments` 신규 행: `member_id`, `staff_id`=본인, `class_session_id`, `content`="코어 안정성 개선 필요", `commented_at` | — |
| 4 | (2차 기능) 운동일지 기록 | 수행 지표 기록 | 강사 > 운동일지 | `exercise_logs` 신규 행: `member_id`, `class_session_id`, `staff_id`, `content`, `metrics_json`, `logged_at` | — |
| 5 | 강사가 매출 메뉴 접근 시도 | (차단) | — | RBAC: 매출/수익분석은 `assigned 매출만` R, 통장 잔액은 **불가**. 접근 거부 + `audit_logs` 기록(접근 시도) | — |

> 강사는 자신의 정산 근거(출석 기준 수업 수 `settlements.session_count`)와 본인 정산금만 조회 가능하며, 다른 강사·전체 매출은 볼 수 없다.

---

## 시나리오 9 — 미수금 회수

**주체**: `manager`(관리자) / `accountant`(회계 담당자)
**정책**: `allow_receivable=true`(미수 허용). 미수금 = `payments.receivable_amount` (`amount − paid_amount`).

| # | 트리거 | 행동 | 화면 | 데이터변화 | 알림 |
|---|---|---|---|---|---|
| 1 | 회원이 "절반만 먼저 결제" | 일부입금 등록 (8회권 240,000 중 120,000 카드) | 회원 상세 > 결제 입력 | `payments` 신규: `payment_status='partial'`(일부입금), `payment_method='card_onsite'`, `amount=240000`, `paid_amount=120000`, `receivable_amount=120000`. 수강권은 정책에 따라 발급(`passes.pass_status='active'`). `members`에 `tag='receivable'`(미수금) | (선택) |
| 2 | 미수 현황 모니터링 | 미수금 회원 목록 조회 | 대시보드 > 미수금 회원 / 정산 > 미수금 | `payments` where `payment_status in ('receivable','partial')` AND `receivable_amount > 0` 집계 | — |
| 3 | 회수 독려 | "미수금 안내 발송" | 회원 상세 | — | `notifications`: `receivable`(미수금) |
| 4 | 회원이 잔액 120,000 입금(이체) | 잔액 입금 처리(수동 또는 통장 매칭, 시나리오 7) | 회원 상세 > 결제 또는 거래 매칭 | `payments.paid_amount=240000`, `receivable_amount=0`, `payment_status='paid'`(결제완료). 통장 매칭 경유 시 `bank_transactions` 연결 + `transaction_reconciliation_logs` 기록. **감사**: `audit_logs.action='update'`(+`match`) | — |
| 5 | 미수 해소 후 정리 | 태그 해제 | 회원 상세 | `members`에서 `tag='receivable'` 제거 | — |

**결제기준 매출과의 관계**: `revenue_recognition=on_paid` 정책에서 결제기준 매출은 실수령액(`paid_amount`) 기준으로 인식하므로, #1 시점엔 120,000원만 매출, #4에서 추가 120,000원이 매출로 인식된다(또는 정책상 미수도 인식 시 별도 표시). 미수금은 손익이 아니라 **받을 돈(채권)** 으로 현금 영역에 표시한다.

---

## 시나리오 10 — 수강권 홀딩(일시정지) / 환불

**주체**: `manager`(관리자) / `owner`(원장)
**정책**: `holdable=true`, `max_hold_days=30`, `extend_allowed=true`, `refund_penalty_rate=0.10`, `refund_unit_basis=list_price`.

### 10-A. 홀딩 (일시정지) → 재개

| # | 트리거 | 행동 | 화면 | 데이터변화 | 알림 |
|---|---|---|---|---|---|
| 1 | 회원 출장으로 2주 정지 요청 | "수강권 정지" + 기간 입력(14일) | 회원 상세 > 수강권 > 정지 | 누적 정지 검증(`paused_days_used + 14 ≤ max_hold_days=30`). `passes.pass_status='paused'`(정지), `paused_at`=now. **감사**: `audit_logs.action='update'` | — |
| 2 | 정지 기간 만료/재개 | "정지 해제" | 회원 상세 > 수강권 | `passes.pass_status='active'`(사용중). `paused_days_used += 14`. `extend_allowed=true`이면 `expire_date += 14일`(정지 일수만큼 만료 연장) | (선택) |

### 10-B. 환불 (부분 사용 후 환불)

상황: 8회권 240,000원, 3회 사용(`remaining_count=5`) 후 전액 환불 요청. 위약공제율 10%, 사용분 공제 단가 = 정가(`list_price` = 240,000/8 = 30,000원/회).

**환불 산식 (원장용 설명 + 정확 계산):**

```
사용분 공제액   = 사용 횟수 × 정가 단가
              = 3회 × 30,000원 = 90,000원
위약금(공제)   = 결제 실판매가 × refund_penalty_rate(0.10)
              = 240,000원 × 0.10 = 24,000원
환불액         = 결제 실판매가 − 사용분 공제 − 위약금
              = 240,000 − 90,000 − 24,000 = 126,000원
복구 회수      = 0 (환불은 잔여횟수를 회수=소멸시키며 별도 복구 아님)
```

> 원장 설명: "낸 돈에서, 이미 쓴 수업값과 위약금을 빼고 돌려준다. 안 쓴 5회는 환불로 사라진다(미소진분이라 소진기준 매출엔 원래 안 잡혀 있었다)."

| # | 트리거 | 행동 | 화면 | 데이터변화 | 알림 |
|---|---|---|---|---|---|
| 3 | 회원 환불 요청 | "환불" → 사용분/위약금 자동 계산 미리보기 | 회원 상세 > 수강권 > 환불 모달 | 위 산식 자동 표시. 담당자 확인 | — |
| 4 | 환불 확정 | "환불 실행" | 환불 모달 > 확정 | `refunds` 신규 행: `payment_id`, `refund_amount=126000`, `refund_reason`, `refunded_at`, `restored_count=0`, `status='completed'`, `refund_method='card_onsite'` 준용. `payments.payment_status='refunded'`(환불완료). `passes.pass_status='refunded'`(환불), `remaining_count=0`. `pass_transactions`: `reason='manual_deduct'`(수동차감) 또는 잔여 소멸 기록, `delta=-5`. **감사**: `audit_logs.action='refund'` | — |
| 5 | 매출 반영 | 자동 | 수익분석 대시보드 | `revenue_records` 신규: `revenue_basis='payment'`, `source_type='refund'`, `amount=-126000`(음수) → 결제기준 순매출 자동 차감. 소진기준은 이미 사용한 3회분(90,000원)만 인식돼 있어 별도 차감 불필요([00-canon §4.2](./00-canon.md)) | — |
| 6 | 카드 환불 시 카드매출 조정 | 카드 취소 반영 | 정산 > 카드매출 | 관련 `card_sales`의 입금/매입 단계 역처리 또는 음수 조정(부분 취소 시 `amount` 조정). 미입금 카드매출 집계 재산정 | — |

---

## 시나리오 간 상태 전이 요약

핵심 enum의 시나리오별 전이를 한눈에 정리한다(상세 정의: [00-canon §3](./00-canon.md)).

| enum | 전이 경로(시나리오) |
|---|---|
| `member_status` | `new_inquiry`→`consulting`→`trial_booked`→`trial_done`→`enrolled`(S1) → `dormant`/`expired` → `re_enrolled` |
| `lead_status` | `new_inquiry`→`contacted`→`trial_booked`→`trial_done`→`enrolled`(S1) / `on_hold` / `lost` |
| `reservation_status` | `booked`(S2/S4)→`attended`/`absent`/`no_show`(S5) / `waitlisted`→`booked`(S3) / `canceled`(S2) |
| `attendance_status` | `attended`/`late`/`absent`/`no_show`/`excused`(S5/S8) |
| `payment_status` | `paid`/`awaiting_deposit`/`partial`→`paid`(S9) / `refunded`(S10) |
| `pass_status` | `active`→`paused`→`active`(S10A) / `active`→`used_up` / `active`→`refunded`(S10B) / `expired` |
| `reconciliation_stage` | `approved`(S4)→`captured`→`deposited`(S7C) |
| `revenue_basis` | `payment`(결제 시·환불 음수) ↔ `consumption`(차감 시) — 토글 비교(S6) |

---

## 관련 문서

- [00-canon.md](./00-canon.md) — 단일 진실원천(스키마·enum·RBAC·회계모델·정책 기본값)
- [02-personas.md](./02-personas.md) — 본 시나리오의 주체(페르소나) 정의
- [13-rbac.md](./13-rbac.md) — 시나리오 내 권한 한정의 상세 매트릭스
- [14-booking-policy.md](./14-booking-policy.md) — 예약/취소/노쇼/차감/대기전환 정책(S2·S3·S5)
- [15-pass-policy.md](./15-pass-policy.md) — 수강권 홀딩/만료/환불 정책(S10)
- [16-payment-refund-policy.md](./16-payment-refund-policy.md) — 결제/미수/환불 정책(S4·S9·S10)
- [17-reconciliation-policy.md](./17-reconciliation-policy.md) — 통장/카드 매칭·분류 정책(S7)
- [18-expense-category-policy.md](./18-expense-category-policy.md) — 비용 카테고리·자동분류(S7)
- [19-metrics.md](./19-metrics.md) — 전환율·수익성·손익 산식(S1·S6)
- [09-admin-dashboard.md](./09-admin-dashboard.md) / [10-profit-dashboard.md](./10-profit-dashboard.md) — 대시보드 화면(S6)
