# 09-admin-dashboard.md — 관리자 대시보드 설계

> **목적:** 원장/관리자가 로그인 직후 한 화면에서 **오늘의 운영 + 이번 달 매출·비용·수익을 10초 안에 파악**하도록, 4영역 위젯의 표시값·계산식·데이터소스·갱신주기·드릴다운·권한을 글자 단위로 확정한다. (근거: [`_source-requirements.md`](./_source-requirements.md) §13·§18, [`00-canon.md`](./00-canon.md))

이 문서는 **운영 모니터링용 통합 대시보드**(원장/관리자 진입 첫 화면)를 다룬다. 수익성 분해·이중 손익 토글·드릴다운 차트 등 심층 분석 화면은 [`10-profit-dashboard.md`](./10-profit-dashboard.md)가 소유한다. 본 문서의 모든 지표 산식은 요약만 싣고, **정밀 산식·엣지케이스는 [`19-metrics.md`](./19-metrics.md)를 정본으로 참조**한다.

- **문서 버전**: v1.0 / 기준일 2026-06-12
- **소유 범위(00-canon §7)**: 관리자 대시보드 4영역 지표(오늘운영/매출/비용/수익)
- **표기**: 금액은 정수(원, `_amount`), 비율은 조회 시 계산(`_rate`), enum은 영문 코드(한글 라벨) 병기.

---

## 1. 설계 원칙과 "10초 파악" 레이아웃

### 1.1 UX 목표 (원본 §18)

| 원칙 | 적용 |
|---|---|
| 원장 10초 파악 | 첫 화면에서 **오늘 운영 + 이번 달 수익**을 스크롤 없이(데스크톱 1뷰포트) 확인 |
| 회계 지식 없이 이해 | 위젯 제목은 한글 일상어("미입금 카드매출", "월말 예상 이익"), 회계용어 미노출. 각 금액 옆 ⓘ 툴팁에 한 줄 풀이 |
| 결제기준 vs 소진기준 구분 | 매출·수익 영역 상단에 **기준 토글**(`revenue_basis`: payment/consumption) 배치. 기본값은 스튜디오 정책 `revenue_recognition`을 따르되 화면 토글로 즉시 전환 |
| 권한별 분리 | 강사·회원은 본 대시보드 미진입. 영역별 RBAC는 §7 |

### 1.2 4영역 우선순위 (위→아래, 좌→우)

원장의 시선 흐름(F자 패턴) 기준으로 **상단=즉시 행동 필요 / 하단=재무 요약** 순서로 배치한다.

```
┌─────────────────────────────────────────────────────────────────────┐
│ [헤더]  스튜디오 선택 ▾   기간: 오늘(2026-06-12) / 이번달(2026-06)   │
│         매출·수익 기준 토글: [결제기준 ●] [소진기준 ○]              │
├──────────────────────────────┬──────────────────────────────────────┤
│ ① 오늘의 운영  (최우선·실시간) │  ④ 이번 달 수익  (원장 핵심 KPI)     │
│  - 오늘 수업 / 예약·잔여석     │   영업이익 · 영업이익률 · 통장잔액    │
│  - 체험·신규상담               │   미입금 카드매출 · 미수금           │
│  - 노쇼위험 · 만료예정 · 미수금 │   예상지출 · 월말 예상이익          │
├──────────────────────────────┼──────────────────────────────────────┤
│ ② 이번 달 매출                 │  ③ 이번 달 비용                      │
│  총매출·환불·순매출            │   총비용·고정비·변동비              │
│  1:1·그룹·체험·기타            │   광고비·강사료·결제수수료·임대료    │
│  신규회원·재등록               │   소모품비·공과금·기타              │
└──────────────────────────────┴──────────────────────────────────────┘
```

- **① 오늘의 운영**: 좌상단 = 가장 먼저 본다. 즉시 조치(노쇼 콜, 미수금 독촉, 만료 회원 재등록 상담)가 필요한 "행동 카드". 실시간성 최우선.
- **④ 이번 달 수익**: 우상단 = 원장이 두 번째로 보는 KPI(영업이익·월말 예상이익). 큰 숫자 + 전월 대비 화살표.
- **② 매출 / ③ 비용**: 하단 좌/우. 수익(④)의 근거를 분해해 보여주는 보조 영역. 막대/도넛 요약.
- **모바일**: ① → ④ → ② → ③ 순으로 세로 스택(원장은 모바일에서도 ①·④를 먼저 본다).

### 1.3 공통 동작 규약

- **테넌트·스튜디오 격리**: 모든 위젯 쿼리는 `WHERE tenant_id = :tenant AND studio_id = :studio AND deleted_at IS NULL` 필수(00-canon §1.2, §5). 다지점 권한자는 헤더에서 스튜디오 전환(전체합산은 2차).
- **기간 정의**: "오늘"=스튜디오 `timezone`(기본 Asia/Seoul) 기준 `recognized_date = CURRENT_DATE`. "이번 달"=KST 기준 당월 1일~말일(`recognized_date BETWEEN date_trunc('month') AND month_end`).
- **빈 데이터**: 0원/0건은 "—" 또는 "0"으로 명시(빈칸 금지). 신규 오픈 샵 첫 달 안내 문구 노출.
- **전월 대비**: 매출·비용·수익 핵심 위젯은 전월 동기간 대비 증감(▲/▼ + %)을 함께 표기.

---

## 2. 영역 ① 오늘의 운영 (실시간 운영 모니터)

> 목적: 원장/인포가 **지금 무엇을 해야 하는가**를 본다. 각 위젯은 클릭 시 대상 목록으로 드릴다운되어 바로 조치(전화/예약/상담)로 연결.

| # | 위젯명 | 표시값 | 계산식 요약 | 데이터소스 (테이블 · 필드) | 갱신주기 | 드릴다운 대상 | 권한 |
|---|---|---|---|---|---|---|---|
| 1-1 | 오늘 수업 | 회차 수 / 타임라인 | `count(class_sessions)` where `start_at`이 오늘 AND `session_status in (scheduled, open, closed, completed)` | `class_sessions`(start_at, session_status, instructor_staff_id, room_id, class_type) | 실시간(1분) | 오늘 수업 타임라인 → 회차 상세(예약 명단) | owner, manager, info_staff |
| 1-2 | 오늘 예약 인원 | 예약 인원 수 | `count(reservations)` where 연결 `class_sessions.start_at`=오늘 AND `reservation_status in (booked, waitlisted, attended)` | `reservations`(reservation_status, class_session_id) · `class_sessions`(start_at) | 실시간(1분) | 오늘 예약자 명단(회원·수업·상태) | owner, manager, info_staff |
| 1-3 | 잔여석 | 합계 잔여석 / 회차별 | Σ`(class_sessions.capacity − 확정예약수)` (확정=`booked,attended`) | `class_sessions`(capacity) · `reservations`(reservation_status) | 실시간(1분) | 회차별 정원/예약/잔여 표 → 대리예약 진입 | owner, manager, info_staff |
| 1-4 | 체험 예약 | 오늘 체험 건수 | `count(reservations)` where `class_sessions.class_type='trial'` AND `start_at`=오늘 AND `reservation_status in (booked, attended)` | `class_sessions`(class_type='trial', start_at) · `reservations`(reservation_status) · `members`(name) | 실시간(5분) | 오늘 체험 회원 목록 → 회원/리드 상세 | owner, manager, info_staff |
| 1-5 | 신규 상담 | 오늘 신규 문의 수 | `count(leads)` where `inquiry_date`=오늘 AND `lead_status='new_inquiry'` | `leads`(lead_status, inquiry_date, marketing_source, assigned_staff_id) | 실시간(5분) | 오늘 신규 리드 목록 → 상담 로그 작성 | owner, manager, info_staff |
| 1-6 | 노쇼 위험 | 위험 회원 수 | `count(distinct members)` 태그 `no_show_risk` 보유 AND 오늘 예약 존재. 보조: 최근 노쇼 이력 다수 | `members`(tag=`no_show_risk`) · `reservations`(오늘) · `attendance`(attendance_status=`no_show`) | 실시간(5분) | 노쇼 위험 회원 목록(오늘 예약 + 과거 노쇼율) → 리마인드 발송 | owner, manager, info_staff |
| 1-7 | 만료 예정 회원 | 만료 임박 수강권 수 | `count(passes)` where `pass_status='active'` AND `expire_date ≤ today + expiring_alert_days(기본 7일)` | `passes`(pass_status, expire_date, remaining_count) · `members`(name) | 1시간 | 만료 임박 회원 목록(잔여·만료일) → 재등록 상담 | owner, manager, info_staff |
| 1-8 | 미수금 회원 | 미수 인원 / 미수 합계 ★ | 인원=`count(distinct member_id)`, 합계=Σ`payments.receivable_amount` where `payment_status in (receivable, partial)` | `payments`(payment_status, receivable_amount, member_id) | 실시간(5분) | 미수금 회원 목록(미수액·결제건) → 입금 처리/독촉 알림 | owner, manager, accountant(R) |

### 2.1 보조 표시(① 영역 칩)

- **대기 자동전환 알림**: `waitlists.status='promoted'` 중 응답시한(`waitlist_promote_ttl_minutes` 기본 30분) 임박 건 배지.
- **자동 폐강 후보**: 오늘 회차 중 확정예약 < `auto_close_min_count`(기본 1) 인 `class_sessions` 경고 칩 → 폐강/유지 결정.

> 정책값(`expiring_alert_days`, `auto_close_min_count`, `waitlist_promote_ttl_minutes`)은 [`14-booking-policy.md`](./14-booking-policy.md)·[`15-pass-policy.md`](./15-pass-policy.md)가 소유. 본 영역은 그 값을 읽어 카운트만 한다.

---

## 3. 영역 ② 이번 달 매출 (Revenue)

> 목적: 이번 달 들어온 매출을 **한 기준(토글)으로** 분해해 본다. 모든 합산은 선택한 `revenue_basis` 하나로만 수행(결제기준·소진기준 중복 합산 금지, 00-canon §4).

**기준 토글 영향**: 아래 위젯은 헤더의 `revenue_basis`(payment/consumption) 토글값으로 필터된다. 단 2-1·2-2는 기준 무관 표기도 병행 가능(④ 수익과 정합 위해 동일 기준 사용 권장).

| # | 위젯명 | 표시값 | 계산식 요약 (정본 §19) | 데이터소스 (테이블 · 필드) | 갱신주기 | 드릴다운 대상 | 권한 |
|---|---|---|---|---|---|---|---|
| 2-1 | 총매출 | ★ 당월 인식 매출(환불 전) | Σ`revenue_records.amount` where `source_type in (payment, consumption)` AND `revenue_basis`=선택 AND `recognized_date` 당월 (환불 음수 제외) | `revenue_records`(amount, revenue_basis, source_type, recognized_date) | 1시간 | 매출 인식 원장(건별) → 결제/소진 상세 | owner, accountant, manager(요약) |
| 2-2 | 환불 | ★ 당월 환불 합계 | Σ`abs(revenue_records.amount)` where `source_type='refund'` AND 당월. 검증: Σ`refunds.refund_amount` where `status='completed'` | `revenue_records`(source_type='refund', amount) · `refunds`(refund_amount, status) | 1시간 | 환불 내역 목록(회원·사유·금액) | owner, accountant |
| 2-3 | 순매출 | ★ 총매출 − 환불 | Σ`revenue_records.amount`(환불 음수 포함) where `revenue_basis`=선택 AND 당월 | `revenue_records`(amount, revenue_basis, recognized_date) | 1시간 | 순매출 추이(일별) → [`10-profit-dashboard.md`](./10-profit-dashboard.md) | owner, accountant, manager(요약) |
| 2-4 | 1:1 | ★ 개인레슨 매출 | Σ`revenue_records.amount` where `class_type='personal'` AND 당월 (소진기준에서 의미 명확; 결제기준은 상품 `pass_kind='personal'` 매핑) | `revenue_records`(class_type, amount) · `products`(pass_kind) | 1시간 | 1:1 매출 분해 → 강사별/회원별 | owner, accountant |
| 2-5 | 그룹 | ★ 그룹레슨 매출 | Σ`revenue_records.amount` where `class_type='group'` AND 당월 | `revenue_records`(class_type='group', amount) | 1시간 | 그룹 매출 분해 | owner, accountant |
| 2-6 | 체험 | ★ 체험수업 매출 | Σ`revenue_records.amount` where `class_type='trial'` AND 당월 (체험권 유상 시) | `revenue_records`(class_type='trial', amount) | 1시간 | 체험 매출/전환 연계 | owner, accountant |
| 2-7 | 기타 | ★ 그 외 매출 | Σ`revenue_records.amount` where `class_type` NULL/미분류 AND 당월 (패키지·잡수입 등) | `revenue_records`(class_type, amount) | 1시간 | 기타 매출 목록 | owner, accountant |
| 2-8 | 신규회원 | ★ 신규회원 매출 | Σ`revenue_records.amount` where `is_new_member=true` AND 당월 | `revenue_records`(is_new_member, amount) | 1시간 | 신규회원 매출 목록 → 유입경로별 | owner, accountant |
| 2-9 | 재등록 | ★ 재등록 매출 | Σ`revenue_records.amount` where `is_re_enroll=true` AND 당월 | `revenue_records`(is_re_enroll, amount) | 1시간 | 재등록 회원 목록 | owner, accountant |

### 3.1 ② 영역 시각화

- 상단: **순매출 큰 숫자** + 전월 대비 ▲/▼%.
- 중단: 수업유형 도넛(1:1 / 그룹 / 체험 / 기타) — **합계 = 총매출(2-1)**. 환불은 `class_type`별 음수 귀속이 어려우므로(환불은 상품 단위 발생, 소진 회차로 역분배 불가) 도넛은 **환불 전 총매출(2-1) 기준**으로 합산하며, 환불(2-2)은 도넛에 포함하지 않고 별도 수치/세그먼트로 표기한다.
- 하단: 신규 vs 재등록 가로 막대.
- **정합 규칙**: 2-3 순매출 = 2-1 총매출 − 2-2 환불. 2-4~2-7(`class_type`별) 합 = 2-1 총매출(분류 누락분은 "기타"로 귀속). 즉 수업유형 도넛의 합계 기준은 **총매출(2-1) 하나로 통일**한다(순매출 아님). 순매출(2-3, 환불 포함)은 상단 큰 숫자로만 표기하고 도넛 합계 기준으로 쓰지 않는다.

> 결제기준과 소진기준의 차이(1결제=결제기준 1건 vs 소진 시 N건), 단가 산정(`passes.unit_price_amount`)은 00-canon §4. 위젯 라벨에는 "기준" 배지를 노출해 혼동을 방지한다.

---

## 4. 영역 ③ 이번 달 비용 (Expense)

> 목적: 이번 달 나간 돈을 카테고리·성격(고정/변동)으로 분해. 통장 출금·카드 사용·수동 입력이 모두 `expense_records`로 통합되어 집계된다.

| # | 위젯명 | 표시값 | 계산식 요약 | 데이터소스 (테이블 · 필드) | 갱신주기 | 드릴다운 대상 | 권한 |
|---|---|---|---|---|---|---|---|
| 3-1 | 총비용 | ★ 당월 비용 합계 | Σ`expense_records.amount` where `expense_date` 당월 | `expense_records`(amount, expense_date, source) | 1시간 | 비용 내역 전체(거래처·카테고리·출처) | owner, accountant |
| 3-2 | 고정비 | ★ 고정비 합계 | Σ`expense_records.amount` where `cost_type='fixed'` AND 당월 | `expense_records`(cost_type='fixed', amount) | 1시간 | 고정비 카테고리 분해 | owner, accountant |
| 3-3 | 변동비 | ★ 변동비 합계 | Σ`expense_records.amount` where `cost_type='variable'` AND 당월 | `expense_records`(cost_type='variable', amount) | 1시간 | 변동비 카테고리 분해 | owner, accountant |
| 3-4 | 광고비 | ★ 광고비 | Σ`expense_records.amount` where `expense_category='advertising'` AND 당월 | `expense_records`(expense_category='advertising') | 1시간 | 광고비 내역 → 유입경로별 CAC 연계 | owner, accountant |
| 3-5 | 강사료 | ★ 강사료 | Σ`expense_records.amount` where `expense_category='instructor_fee'` AND 당월 (검증: `settlements.total_amount` 확정분) | `expense_records`(expense_category='instructor_fee', staff_id) · `settlements`(total_amount, status) | 1시간 | 강사별 강사료/정산 → [`10-profit-dashboard.md`](./10-profit-dashboard.md) | owner, accountant |
| 3-6 | 결제수수료 | ★ 카드 등 수수료 | Σ`expense_records.amount` where `expense_category='payment_fee'` AND 당월 (추정 시 Σ`card_sales.fee_amount`) | `expense_records`(expense_category='payment_fee') · `card_sales`(fee_amount) | 1시간 | 결제수수료 내역(카드매출 매칭) | owner, accountant |
| 3-7 | 임대료 | ★ 임대료 | Σ`expense_records.amount` where `expense_category='rent'` AND 당월 | `expense_records`(expense_category='rent') | 1시간 | 임대료/관리비 내역 | owner, accountant |
| 3-8 | 소모품비 | ★ 소모품비 | Σ`expense_records.amount` where `expense_category='supplies'` AND 당월 | `expense_records`(expense_category='supplies') | 1시간 | 소모품비 내역 | owner, accountant |
| 3-9 | 공과금 | ★ 공과금 | Σ`expense_records.amount` where `expense_category='utilities'` AND 당월 | `expense_records`(expense_category='utilities') | 1시간 | 공과금 내역 | owner, accountant |
| 3-10 | 기타 | ★ 그 외 비용 | Σ`expense_records.amount` where `expense_category` NOT IN (위 명시 6종) AND 당월 (`maintenance_fee, payroll, facility, telecom, tax_accounting, education, insurance, tax, meal, transport, etc` 포함) | `expense_records`(expense_category, amount) | 1시간 | 기타 카테고리 상세(전체 17종 분해) | owner, accountant |

### 4.1 ③ 영역 시각화 및 정합

- 상단: **총비용 큰 숫자** + 전월 대비.
- 중단: **고정비 vs 변동비** 100% 누적 막대(3-2 + 3-3 = 3-1).
- 하단: 카테고리 Top 막대(광고비/강사료/결제수수료/임대료/소모품비/공과금/기타).
- **정합 규칙**: 3-4~3-10 합 = 3-1 총비용(명시 6종 + 기타로 17종 전부 귀속). 카테고리 17종 정의는 00-canon §3.13, 상세 자동분류는 [`18-expense-category-policy.md`](./18-expense-category-policy.md).
- **미분류 경고**: CSV 업로드 후 `match_target` 미정 거래가 있으면 "분류 대기 N건" 배지 → [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) 매칭 화면으로 이동.

---

## 5. 영역 ④ 이번 달 수익 (Profit & Cash) — 원장 핵심 KPI

> 목적: 원장이 **가장 보고 싶은 숫자**. 영업이익·영업이익률과 함께 "현금이 지금 어디에 묶여 있는가"(미입금 카드매출·미수금)와 "월말에 얼마 남을까"(예상 이익)를 한 묶음으로 보여준다. 비전문가 풀이 툴팁 필수.

| # | 위젯명 | 표시값 | 계산식 요약 (정본 §19) | 데이터소스 (테이블 · 필드) | 갱신주기 | 드릴다운 대상 | 권한 |
|---|---|---|---|---|---|---|---|
| 4-1 | 영업이익 | ★ 당월 순이익 | 순매출(2-3) − 총비용(3-1) = Σ`revenue_records.amount` − Σ`expense_records.amount` (선택 `revenue_basis`) | `revenue_records`(amount) · `expense_records`(amount) | 1시간 | 손익 분해(매출−비용 폭포 차트) | owner, accountant |
| 4-2 | 영업이익률 | % 비율 | `영업이익 ÷ 순매출`(순매출=0이면 "—") | 4-1 ÷ 2-3 (조회 시 계산, 저장 안 함) | 1시간 | 이익률 추이(월별) → [`10-profit-dashboard.md`](./10-profit-dashboard.md) | owner, accountant |
| 4-3 | 통장 잔액 | ★ 현재 잔액 | Σ`bank_accounts.balance_amount` where `status='active'` (스냅샷, `last_synced_at` 함께 표기) | `bank_accounts`(balance_amount, status, last_synced_at) | 동기화 시점(수동/오픈뱅킹) | 계좌별 잔액·최근 거래 → 거래내역 | owner, accountant |
| 4-4 | 미입금 카드매출 | ★ 아직 안 들어온 카드돈 | Σ`card_sales.net_deposit_amount` where `reconciliation_stage != 'deposited'` (승인·매입했으나 통장 미입금) | `card_sales`(net_deposit_amount, reconciliation_stage) | 1시간 | 미입금 카드매출 목록(승인일·매입일·예상입금) | owner, accountant |
| 4-5 | 미수금 | ★ 못 받은 회원 결제 | Σ`payments.receivable_amount` where `payment_status in (receivable, partial)` | `payments`(receivable_amount, payment_status, member_id) | 실시간(5분) | 미수금 회원 목록(① 1-8과 동일 소스) → 입금 처리 | owner, accountant |
| 4-6 | 예상 지출 | ★ 남은 달 나갈 돈 | MTD 발생비용 + 미발생 반복 고정비 + **변동비 일할(런레이트) 추정**. = Σ(`expense_records` MTD 당월 발생분) + Σ(`expense_records` where `is_recurring=true` AND `cost_type='fixed'` 당월 미집행 예정) + 변동비 런레이트(= 변동비 MTD ÷ 경과일수 × 당월 총일수 − 변동비 MTD) (정본 §5.1) | `expense_records`(amount, is_recurring, cost_type, expense_date) | 1시간 | 예정 비용 목록(반복·고정 일정 + 변동비 추정) | owner, accountant |
| 4-7 | 월말 예상 이익 | ★ 월말 예상 영업이익 | (월말 예상 순매출) − (당월 발생 비용 + 예상 지출 4-6). 예상 순매출=당월 인식 + 미인식 예약·잔여 소진 추정 | `revenue_records` · `expense_records` · `reservations`(잔여 예약) · `passes`(remaining) | 6시간(추정 모델) | 월말 예상 손익 시뮬레이션 → [`10-profit-dashboard.md`](./10-profit-dashboard.md) | owner, accountant |

### 5.1 비전문가 풀이 툴팁(원장 이해용)

| 위젯 | ⓘ 한 줄 풀이 |
|---|---|
| 영업이익 | "이번 달 들어온 돈(순매출)에서 나간 돈(총비용)을 뺀, 실제로 남은 이익이에요." |
| 영업이익률 | "100만 원을 벌면 그중 몇 %가 이익으로 남는지예요. 이익 ÷ 순매출." |
| 통장 잔액 | "지금 사업자 통장에 실제로 있는 돈이에요(마지막 동기화 기준)." |
| 미입금 카드매출 | "회원이 카드로 결제했지만, 아직 우리 통장에 안 들어온 돈이에요. 보통 며칠 뒤 입금돼요." |
| 미수금 | "결제하기로 했는데 아직 못 받은 회원 돈이에요." |
| 예상 지출 | "이번 달 안에 더 나갈 것으로 보이는 고정비·반복비용에, 지금까지 쓴 추세로 본 변동비(강사료·소모품·수수료 등)까지 더한 금액이에요." |
| 월말 예상 이익 | "지금 추세대로 가면 이번 달이 끝났을 때 남을 것으로 보이는 이익이에요." |

### 5.2 결제기준 vs 소진기준 주의 (00-canon §4 / 19-metrics)

- **④의 매출 측(2-3, 4-1, 4-7)** 은 헤더 토글 `revenue_basis`를 따른다. **결제기준**은 현금흐름(통장 잔액·예상 현금)과 잘 맞고, **소진기준**은 강사료 등 수업 원가 대비 수익성과 잘 맞는다.
- **현금 위젯(4-3 통장잔액, 4-4 미입금 카드매출, 4-5 미수금)** 은 기준 토글과 무관한 **실현 현금 상태**다. 토글을 바꿔도 이 값은 변하지 않는다(혼동 방지 위해 "현금 상태" 소제목으로 묶음).
- 정밀 산식·추정 모델·엣지케이스(라운딩 잔차, 환불 소급, 미수 인식 여부)는 [`19-metrics.md`](./19-metrics.md)가 정본.

---

## 6. 갱신주기 정책(요약)

| 갱신주기 | 적용 위젯 | 구현 방식 |
|---|---|---|
| 실시간(1분) | 1-1 오늘수업, 1-2 예약인원, 1-3 잔여석 | 캐시 1분 TTL 또는 라이트 폴링 |
| 실시간(5분) | 1-4 체험, 1-5 신규상담, 1-6 노쇼위험, 1-8 미수금, 4-5 미수금 | 5분 TTL 캐시 |
| 1시간 | ② 매출 전체, ③ 비용 전체, 1-7 만료예정, 4-1·4-2·4-4·4-6 | 시간별 집계 잡(materialized view 갱신) |
| 6시간 | 4-7 월말 예상 이익 | 추정 모델 배치 |
| 동기화 시점 | 4-3 통장 잔액 | `bank_accounts.last_synced_at` 갱신 시(CSV 업로드/오픈뱅킹) |

- 집계 위젯은 **사전 집계 뷰**(일자·기준별 `revenue_records`/`expense_records` 합계)로 응답속도를 보장하고, 헤더에 "마지막 갱신 HH:MM"을 표기한다.
- 수동 새로고침 버튼 제공(집계 잡 강제 트리거, owner/accountant 한정).

---

## 7. 영역별 권한 정책 (RBAC, 00-canon §5 준수)

> 원칙: 강사·회원은 본 운영 대시보드 **미진입**. 강사는 전체 매출·통장 잔액 접근 불가(원본 §14). 상세 매트릭스는 [`13-rbac.md`](./13-rbac.md) 정본.

| 영역 | owner | manager | info_staff | accountant | instructor | member |
|---|---|---|---|---|---|---|
| ① 오늘의 운영 | R(all) | R(all) | R(all) | R(미수금만) | 불가(본인 수업은 별도 화면) | 불가 |
| ② 이번 달 매출 | R(all) | R(요약만) | 불가 | R(all) | 불가 | 불가 |
| ③ 이번 달 비용 | R(all) | 불가 | 불가 | R(all) | 불가 | 불가 |
| ④ 이번 달 수익 | R(all) | 불가 | 불가 | R(all) | 불가 | 불가 |
| └ 통장 잔액(4-3) | R | 불가 | 불가 | R | **불가(명시)** | 불가 |

- **manager**: ② 매출은 순매출 등 **요약 수치만**(상세 원장 드릴다운 불가). 비용·수익(③④)은 미노출.
- **info_staff**: ① 영역만(운영 실무). 매출/비용/수익 미노출.
- **accountant**: 회계 핵심(②③④ 전체 + ① 미수금). 운영 위젯(수업/예약)은 읽기 보조.
- **instructor / member**: 본 대시보드 진입 차단. 강사는 담당 수업·담당 회원 화면, 회원은 모바일 웹 마이페이지로 분리(00-canon §5).
- **모든 드릴다운**에서 수정/삭제/환불/수강권 차감 액션 발생 시 `audit_logs`에 기록(00-canon §1.2, §5). 본 대시보드는 조회 중심이나 드릴다운 후속 액션이 로그 대상이다.

---

## 8. 데이터소스 정합·구현 노트

- **매출 위젯의 단일 출처**: ②·④의 매출 측은 모두 `revenue_records`(amount, revenue_basis, source_type, recognized_date, class_type, is_new_member, is_re_enroll)에서만 합산한다. `payments`/`purchases`/`refunds`는 검증·드릴다운용 교차 확인 소스로만 사용(이중 합산 금지).
- **비용 위젯의 단일 출처**: ③·④의 비용 측은 모두 `expense_records`(amount, expense_category, cost_type, expense_date, is_recurring)에서 합산. `card_expenses`/`bank_transactions`는 매칭→`expense_records` 생성 후 집계되므로, 미매칭 거래는 "분류 대기"로만 카운트하고 비용 합계에 포함하지 않는다.
- **인덱스 권장**(00-canon §1.1 규약): `idx_revenue_records_basis_date(tenant_id, studio_id, revenue_basis, recognized_date)`, `idx_expense_records_cat_date(tenant_id, studio_id, expense_category, expense_date)`, `idx_payments_status_recv(tenant_id, studio_id, payment_status)`. 확정 인덱스는 [`11-erd.md`](./11-erd.md)가 소유.
- **소프트 삭제·감사**: 모든 집계는 `deleted_at IS NULL` 필터. 금액·환불·차감 변경은 물리 삭제 없이 `audit_logs` 기록(00-canon §1.2).

---

## 관련 문서

- [`_source-requirements.md`](./_source-requirements.md) — 정본 소스(§13 4영역, §18 UX 원칙)
- [`00-canon.md`](./00-canon.md) — 단일 진실원천(스키마·enum·회계모델 §4·RBAC §5·정책 §6)
- [`10-profit-dashboard.md`](./10-profit-dashboard.md) — 수익분석 대시보드(이중 손익 토글·수익성 분해·드릴다운 상세)
- [`13-rbac.md`](./13-rbac.md) — 권한 정책 정본(영역별 RBAC 확장)
- [`14-booking-policy.md`](./14-booking-policy.md) — 예약/취소/노쇼/차감(① 운영 위젯 정책값)
- [`15-pass-policy.md`](./15-pass-policy.md) — 수강권 정책(만료 임박·잔여 알림 임계)
- [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) — 결제/환불(미수금·환불 위젯)
- [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) — 통장/카드 매칭(미입금 카드매출·분류 대기)
- [`18-expense-category-policy.md`](./18-expense-category-policy.md) — 비용 카테고리(17종·고정/변동·자동분류)
- [`19-metrics.md`](./19-metrics.md) — 수익분석 지표 정의(모든 위젯 산식 정본)
