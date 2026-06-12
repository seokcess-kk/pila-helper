# 04-feature-catalog.md — 전체 기능 목록 (Feature Catalog)

> **목적**: 원본 요구사항 §1~§15의 16개 기능 모듈 전부를 `모듈 → 기능 → 세부기능` 3단 표로 빠짐없이 망라하고,
> 각 세부기능에 **단계 태그(MVP / 2차 / 3차)** 와 **대표 역할(누가 주로 쓰는가)**, **관련 테이블·enum**을 매핑한다.
> 본 문서는 [`00-canon.md`](./00-canon.md)의 엔티티·enum·RBAC·정책 기본값을 **글자 단위로** 따른다. 정의 충돌 시 canon이 우선한다.

---

## 0. 읽는 법 (표기 규약)

- **단계 태그**
  - `MVP` — 신규 샵 1호점 오픈에 필요한 필수 기능(원본 §17 MVP, §5 scope 대상).
  - `2차` — 자동화·수익성 분해·알림톡·운동일지 등(원본 §17 2차).
  - `3차` — 오픈뱅킹·카드매출조회·PG·전자계약·다지점·SaaS 과금·세무 리포트(원본 §17 3차).
  - **분할 태그** — 한 기능이 하위 범위별로 단계가 다르면 `MVP(범위A)·2차(범위B)` 형태로 병기한다. 예: 알림은 인앱 템플릿/이력 화면은 MVP, SMS 실발송은 2차(`MVP(인앱/템플릿)·2차(실발송)`). 경계 기준은 canon §6.4 / 07-ia §7 / 12-api §13과 정렬한다.
- **대표 역할**: canon §3.18 `role` enum 코드를 사용한다 — `owner`(샵 오너) · `manager`(샵 관리자) · `info_staff`(인포 직원) · `instructor`(강사) · `accountant`(회계 담당자) · `member`(회원) · `saas_admin`(SaaS 최고관리자). "대표"는 **가장 빈번히 사용하는 주체**이며, RBAC 전체 매트릭스는 canon §5 / [`13-rbac.md`](./13-rbac.md)가 소유한다.
- **관련 테이블/enum**: canon §2 엔티티 사전 / §3 enum 사전의 코드를 그대로 인용한다.
- 기능 코드 `F-NN-MM`은 본 문서 내 참조용 식별자(모듈번호-기능순번)이며 DB 식별자가 아니다.
- 모듈 번호(M01~M16)는 원본 §1~§15 + DB설계(§16)를 16개로 정렬한 것이다. 모듈 매핑은 §99 부록 대조표 참조.

### 모듈 한눈 요약

| 모듈 | 영역 | 핵심 테이블(canon §2) | MVP 비중 |
|---|---|---|---|
| M01 회원 관리 | 회원 마스터·이력·태그 | `members`, `users` | 높음 |
| M02 상담 CRM | 문의→체험→등록 파이프라인 | `leads`, `counseling_logs`, `marketing_sources` | 높음 |
| M03 수업 관리 | 템플릿·회차·룸·강사배정 | `class_templates`, `class_sessions`, `rooms` | 높음 |
| M04 예약 관리 | 예약·취소·대기·출석 | `reservations`, `waitlists`, `attendance` | 높음 |
| M05 수강권/상품 | 권종·잔여·정지·환불계산 | `products`, `passes`, `pass_transactions` | 높음 |
| M06 결제 관리 | 결제·미수·입금대기 | `purchases`, `payments` | 높음 |
| M07 환불 관리 | 부분/전액 환불·복구 | `refunds` | 높음 |
| M08 매출 관리 | 이중 손익 매출 인식 | `revenue_records` | 높음 |
| M09 비용 관리 | 비용원장·17카테고리·고정/변동 | `expense_records`, `expense_categories` | 높음 |
| M10 통장/카드 연동 | CSV·매칭·자동분류 | `bank_*`, `card_*`, `transaction_*` | 중(매칭 일부) |
| M11 수익분석 | 결제/소진 기준 지표·예측 | `revenue_records`, `expense_records`, `financial_reports` | 중(기본) |
| M12 알림 자동화 | 13종 알림·채널 | `notification_templates`, `notifications` | 중(템플릿/이력 인앱 MVP, 실발송 2차) |
| M13 강사 관리 | 프로필·실적·정산·코멘트 | `staff`, `settlements`, `instructor_comments`, `exercise_logs` | 중 |
| M14 관리자 대시보드 | 4영역 경영 현황 | (집계 뷰) | 높음 |
| M15 권한·감사 | RBAC·audit | `roles`, `permissions`, `audit_logs` | 높음 |
| M16 SaaS·연동·인프라 | 테넌시·구독·외부연동 | `tenants`, `studios`, `subscription_*`, `external_integrations`, `sync_logs` | 중(테넌시 설계) |

---

## M01. 회원 관리 (원본 §1)

> 회원·잠재고객 마스터와 360° 이력(예약·출석·결제·환불·상담·알림)·태그를 관리. 상담고객은 동일 `members` 레코드로 등록 후 전환 시 승격(canon §2-6).

| 기능 | 세부기능 | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-01-01 회원 등록 | 이름·연락처·성별·생년월일 입력으로 신규 `members` 생성 | MVP | manager | `members`(`name`,`phone`,`gender`,`birth_date`) |
| F-01-02 상담고객 등록 | 미등록 잠재고객을 `member_status=new_inquiry`로 선등록 | MVP | info_staff | `members`, `member_status` |
| F-01-03 회원 상태 관리 | 상태 전이: 신규문의→상담중→체험예약→체험완료→등록완료→휴면/만료→재등록완료 | MVP | manager | `member_status`(§3.1: `new_inquiry`/`consulting`/`trial_booked`/`trial_done`/`enrolled`/`dormant`/`expired`/`re_enrolled`) |
| F-01-04 회원 프로필 상세 | 유입경로·운동 목적(`goal`)·통증/주의(`medical_note`)·상담 메모(`memo`) 기록 | MVP | manager | `members`(`goal`,`medical_note`,`memo`,`marketing_source`) |
| F-01-05 담당자 지정 | 회원별 담당 직원/강사 배정 | MVP | manager | `members.assigned_staff_id`→`staff` |
| F-01-06 수강권 이력 | 회원이 보유/과거 보유한 수강권 목록·잔여·만료 | MVP | manager | `passes`, `pass_status` |
| F-01-07 예약 이력 | 회원의 전체 예약/취소/대기 내역 | MVP | manager | `reservations`, `reservation_status` |
| F-01-08 출석 이력 | 출석/지각/결석/노쇼 누적 내역 | MVP | manager | `attendance`, `attendance_status` |
| F-01-09 결제 이력 | 회원의 구매·결제·미수 내역 | MVP | manager | `purchases`, `payments`, `payment_status` |
| F-01-10 환불 이력 | 회원의 환불 발생 내역·복구 회수 | MVP | manager | `refunds` |
| F-01-11 상담 이력 | 회원과 연결된 상담 기록 타임라인 | MVP | info_staff | `counseling_logs`, `leads` |
| F-01-12 알림 발송 이력 | 회원에게 보낸 알림 로그 | 2차 | manager | `notifications` |
| F-01-13 회원 태그 | 노쇼주의/재등록유력/장기미방문/VIP/체험고객/만료임박/미수금 부여·필터 | MVP(수동)/2차(자동) | manager | `tag`(§3.17: `no_show_risk`/`re_enroll_likely`/`long_absent`/`vip`/`trial`/`expiring`/`receivable`) |
| F-01-14 회원 검색·필터 | 이름·연락처·상태·태그·담당자·만료임박 다중 필터 | MVP | info_staff | `members`(인덱스 `idx_members_*`) |
| F-01-15 회원 본인 프로필 | 회원이 모바일 웹에서 본인 정보·잔여횟수·이력 조회 | MVP | member | `users.member_id`, `members`(scope=own) |
| F-01-16 회원 계정 연결 | 회원에게 로그인 계정(`users`) 발급/초대 | MVP | manager | `users`(`role=member`,`member_id`) |
| F-01-17 휴면/만료 자동 전환 | 장기 미방문·수강권 만료 시 상태 자동 변경 배치 | 2차 | manager | `member_status`(`dormant`/`expired`), 정책 `long_absence_days` |

---

## M02. 상담 CRM (원본 §10)

> 신규 문의 → 연락 → 체험 → 등록 전환 파이프라인. 유입경로·전환율·미등록 사유를 추적해 마케팅 ROI의 근거를 만든다.

| 기능 | 세부기능 | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-02-01 신규 문의 등록 | 문의 건별 `leads` 생성(이름·연락처·유입경로) | MVP | info_staff | `leads`, `lead_status=new_inquiry` |
| F-02-02 유입경로 기록 | 네이버 플레이스/블로그/인스타그램/지인소개/오프라인/광고/기타 | MVP | info_staff | `marketing_source`(§3.16: `naver_place`/`naver_blog`/`instagram`/`referral`/`offline`/`ad`/`etc`) |
| F-02-03 상담 상태 관리 | 신규문의→연락완료→체험예약→체험완료→등록완료/보류/실패 | MVP | info_staff | `lead_status`(§3.2: `new_inquiry`/`contacted`/`trial_booked`/`trial_done`/`enrolled`/`on_hold`/`lost`) |
| F-02-04 단계별 일자 기록 | 상담일·체험예약일·체험완료일·등록일 추적 | MVP | info_staff | `leads`(`inquiry_date`,`trial_booked_date`,`trial_done_date`,`enrolled_date`) |
| F-02-05 상담 담당자 배정 | 리드별 담당 직원 지정 | MVP | manager | `leads.assigned_staff_id`→`staff` |
| F-02-06 상담 메모/이력 | 통화/방문/메시지 기록 한 건씩 누적 | MVP | info_staff | `counseling_logs`(`channel`,`content`,`consulted_at`) |
| F-02-07 미등록 사유 기록 | `lost` 처리 시 사유 입력(가격/거리/시간/경쟁사 등) | MVP | info_staff | `leads.lost_reason` |
| F-02-08 리드→회원 전환 | 등록 시 `lead`를 `member`로 연결·승격 | MVP | manager | `leads.member_id`→`members`, `member_status=enrolled` |
| F-02-09 상담 리마인드 | 다음 액션 일시 설정·리마인드 알림 | 2차 | info_staff | `counseling_logs.next_action_at`, `notification_type=counseling_reminder` |
| F-02-10 체험 등록 전환율 | 체험완료 대비 등록 비율 산출 | 2차 | owner | `leads`, 지표 §19 |
| F-02-11 유입경로별 등록 전환율 | 경로별 문의→등록 퍼널 분석 | 2차 | accountant | `marketing_source`, `revenue_records.marketing_source` |
| F-02-12 유입경로별 매출/수익성 | 경로별 매출·이익 기여 분석 | 2차 | accountant | `revenue_records`(`marketing_source`), §19 metrics |
| F-02-13 상담 파이프라인 보드 | 칸반형 단계별 리드 현황 뷰 | 2차 | manager | `lead_status` |

---

## M03. 수업 관리 (원본 §2)

> 정규 반복(템플릿)·단일 수업·체험수업을 강사/공간/정원/정책과 함께 정의하고, 실제 발생 회차(`class_sessions`)를 생성한다.

| 기능 | 세부기능 | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-03-01 수업 유형 정의 | 1:1 개인레슨·그룹레슨·체험수업 구분 | MVP | manager | `class_type`(§3.3: `personal`/`group`/`trial`) |
| F-03-02 정규 반복 수업 | 요일·시간 RRULE로 반복 템플릿 생성 | MVP | manager | `class_templates`(`recurrence_rule`) |
| F-03-03 단일 수업 | 1회성 수업 회차 직접 생성(템플릿 NULL) | MVP | manager | `class_sessions`(`class_template_id` NULL) |
| F-03-04 강사 배정 | 회차별 담당 강사 지정 | MVP | manager | `class_sessions.instructor_staff_id`→`staff` |
| F-03-05 공간/정원 설정 | 룸 배정·정원·대기정원 설정 | MVP | manager | `rooms`(`capacity`), `class_sessions`(`capacity`,`waitlist_capacity`) |
| F-03-06 룸 마스터 관리 | 수업 공간 등록·정원·활성 상태 | MVP | manager | `rooms`(`name`,`capacity`,`status`) |
| F-03-07 예약 가능 시간 설정 | 예약 오픈일·마감(분) 정책 오버라이드 | MVP | manager | `class_templates`(`booking_open_days`,`booking_close_minutes`), 정책 §6.1 |
| F-03-08 취소 가능 시간 설정 | 무차감 취소 마감(분) 설정 | MVP | manager | `cancel_deadline_minutes`(§6.1) |
| F-03-09 공개/비공개 설정 | 회원 모바일 웹 노출 여부 | MVP | manager | `class_sessions.is_public` |
| F-03-10 수업 회차 상태 | 예정/예약가능/예약마감/폐강/종료 관리 | MVP | manager | `session_status`(§3.4: `scheduled`/`open`/`closed`/`canceled`/`completed`) |
| F-03-11 자동 폐강 | 최소인원 미달 회차 자동 폐강 후보 처리 | 2차 | manager | 정책 `auto_close_min_count`(§6.1), `session_status=canceled` |
| F-03-12 대기자 자동 전환 | 결원 시 대기 1순위 자동 확정 | 2차 | manager | `waitlists`, 정책 `waitlist_auto_promote`(§6.1) |
| F-03-13 강사 대체 배정 | 회차 단위 대체 강사 지정 | 2차 | manager | `class_sessions.substitute_staff_id`→`staff` |
| F-03-14 수업 캘린더 뷰 | 일/주/룸별 타임테이블 조회 | MVP | info_staff | `class_sessions`(`start_at`,`end_at`,`room_id`) |
| F-03-15 회차 일괄 생성 | 템플릿 기준 향후 N일 회차 생성 배치 | MVP | manager | `class_templates`→`class_sessions` |

---

## M04. 예약 관리 (원본 §3)

> 회원 모바일 웹 직접 예약·관리자 대리 예약, 취소/대기/변경, 출석/결석/노쇼 처리와 차감 정책 연동. 정책 상세는 [`14-booking-policy.md`](./14-booking-policy.md).

| 기능 | 세부기능 | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-04-01 회원 직접 예약 | 모바일 웹에서 회차 선택·예약(30초 목표) | MVP | member | `reservations`(`is_self_booked=true`), `reservation_status=booked` |
| F-04-02 관리자 대리 예약 | 관리자가 회원 대신 예약 | MVP | info_staff | `reservations`(`is_self_booked=false`) |
| F-04-03 예약 시 수강권 선택 | 차감 대상 수강권 자동/수동 지정 | MVP | member | `reservations.pass_id`→`passes` |
| F-04-04 예약 취소 | 정상 취소(취소마감 이전, 무차감) | MVP | member | `reservation_status=canceled`, `canceled_at` |
| F-04-05 지각 취소 차감 | 취소마감 이후 취소 시 차감 처리 | MVP | manager | 정책 `late_cancel_deduct`(§6.1), `pass_txn_reason=deduct_*` |
| F-04-06 예약 변경 | 다른 회차로 이동(취소+재예약 합성) | 2차 | info_staff | `reservations` |
| F-04-07 대기 신청 | 정원 초과 시 대기열 등록 | MVP | member | `waitlists`(`position`,`status=waiting`), `reservation_status=waitlisted` |
| F-04-08 대기 확정/응답시한 | 자동 전환 후 무응답 시 다음 순번 | 2차 | manager | 정책 `waitlist_promote_ttl_minutes`(§6.1), `waitlists.status=promoted` |
| F-04-09 출석 처리 | 출석/지각 체크 | MVP | instructor | `attendance`(`attendance_status` `attended`/`late`), `checked_by` |
| F-04-10 결석 처리 | 사전 통보 결석 기록 | MVP | info_staff | `attendance_status=absent`, `reservation_status=absent` |
| F-04-11 노쇼 처리 | 무단 불참·차감 정책 적용 | MVP | info_staff | `attendance_status=no_show`, 정책 `no_show_deduct`(§6.1) |
| F-04-12 사유결석(면제) | `excused` 처리 시 차감 면제 가능 | 2차 | manager | `attendance_status=excused`, `attendance.deducted=false` |
| F-04-13 당일 취소 정책 적용 | 당일/마감 후 취소 차감 규칙 자동 판정 | MVP | manager | 정책 §6.1, `reservations.cancel_reason` |
| F-04-14 차감 시점 정책 | 예약 시 차감 vs 출석 시 차감 선택 | MVP | owner | 정책 `deduct_timing`(`on_booking`/`on_attend`), `pass_txn_reason` |
| F-04-15 1일 예약 한도 | 회원 1인 1일 최대 예약 수 제한 | MVP | manager | 정책 `daily_booking_limit`(§6.1) |
| F-04-16 예약 알림 연동 | 예약 완료/취소/대기 확정 알림 트리거 | 2차 | member | `notification_type`(`reservation_done`/`reservation_canceled`/`waitlist_promoted`) |
| F-04-17 예약 전 리마인드 | 수업 전 N분 리마인드 발송 | 2차 | member | `notification_type=reservation_reminder`, `reminder_before_minutes` |
| F-04-18 출석부 뷰 | 회차별 예약자·출석 현황 일괄 체크 | MVP | instructor | `class_sessions`+`reservations`+`attendance` |

---

## M05. 수강권/상품 관리 (원본 §4)

> 횟수권 중심 상품 정의와 회원 보유 수강권 인스턴스, 차감/복구 원장(append-only), 홀딩·연장·환불 계산. 정책은 [`15-pass-policy.md`](./15-pass-policy.md).

| 기능 | 세부기능 | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-05-01 상품 정의 | 권종·총횟수·유효기간·가격·사용가능 수업유형 | MVP | manager | `products`(`pass_kind`,`total_count`,`valid_days`,`price_amount`,`allowed_class_types`) |
| F-05-02 권종 구분 | 1:1권/그룹권/체험권/패키지권 | MVP | manager | `pass_kind`(§3.7: `personal`/`group`/`trial`/`package`) |
| F-05-03 기간제한 횟수권 | 시작일~종료일 + 잔여횟수 동시 관리 | MVP | manager | `passes`(`start_date`,`expire_date`,`remaining_count`) |
| F-05-04 수강권 발급 | 구매 시 회원에게 수강권 인스턴스 생성 | MVP | manager | `passes`(`product_id`,`purchase_id`), `pass_status=active` |
| F-05-05 잔여횟수 차감 | 예약/출석 시 정책에 따라 1회 차감 | MVP | info_staff | `pass_transactions`(`reason` `deduct_booking`/`deduct_attend`, `delta`<0, `balance_after`) |
| F-05-06 취소/폐강 복구 | 무차감 취소·폐강 시 횟수 복구 | MVP | manager | `pass_txn_reason`(`restore_cancel`/`restore_close`, `delta`>0) |
| F-05-07 수동 차감/복구 | 관리자 수동 조정 + 사유·감사기록 | MVP | manager | `pass_txn_reason`(`manual_deduct`/`manual_restore`), `audit_logs` |
| F-05-08 홀딩(일시정지) | 수강권 정지·만료일 자동 연장 | 2차 | manager | `pass_status=paused`, 정책 `holdable`/`max_hold_days`(§6.2), `passes.paused_days_used` |
| F-05-09 만료 연장 | 만료일 수동 연장(정책 허용 시) | 2차 | manager | 정책 `extend_allowed`(§6.2) |
| F-05-10 사용 가능 수업 제한 | 권종별 사용 가능 `class_type` 제약 | MVP | manager | `products.allowed_class_types`, `passes.pass_kind` |
| F-05-11 수강권 상태 전이 | 사용중/정지/만료/환불/소진완료 | MVP | manager | `pass_status`(§3.8: `active`/`paused`/`expired`/`refunded`/`used_up`) |
| F-05-12 사용 이력 조회 | 수강권별 차감/복구 원장 타임라인 | MVP | manager | `pass_transactions`(append-only) |
| F-05-13 소진기준 단가 산정 | 결제액÷총횟수 단가 발급 시 고정 | MVP | accountant | `passes.unit_price_amount = round(final_amount / total_count)`(canon §4.2) |
| F-05-14 환불 계산 | 사용분 공제 후 환불액 산식 제공 | MVP | manager | 정책 `refund_unit_basis`/`refund_penalty_rate`(§6.3), [`16-...`](./16-payment-refund-policy.md) |
| F-05-15 잔여부족/만료임박 알림 | 임계 이하·만료 N일 전 알림 트리거 | 2차 | member | `notification_type`(`pass_low_count`/`pass_expiring`), `low_count_threshold`/`expiring_alert_days`(§6.2) |
| F-05-16 만료 자동 처리 | 만료일 경과 시 `expired` 전환 배치 | 2차 | manager | `pass_status=expired` |

### 환불 계산 산식(원장용 쉬운 설명 + 정확식)

> 쉬운 설명: "낸 돈에서 **이미 쓴 수업값**과 **약속 위반 위약금**을 빼고 돌려준다."

```
사용분단가 = (refund_unit_basis == 'list_price') ? products.price_amount / total_count
                                                  : purchases.final_amount / total_count
사용분공제 = 사용횟수 × 사용분단가
위약금     = round(final_amount × refund_penalty_rate)      # 기본 0.10
환불액(refund_amount) = max(0, final_amount − 사용분공제 − 위약금)
복구회수(restored_count) = total_count − 사용횟수          # 환불 시 잔여 회수
```

예시: 정가=실판매가 1,000,000원 / 총 20회 / 사용 5회 / 위약 10%
- 사용분공제 = 5 × (1,000,000 / 20) = 250,000
- 위약금 = 1,000,000 × 0.10 = 100,000
- 환불액 = 1,000,000 − 250,000 − 100,000 = **650,000원**, `restored_count` = 15

---

## M06. 결제 관리 (원본 §5)

> 현장 카드·계좌이체·무통장입금·현금 결제 기록과 미수금·입금대기 상태, PG 확장 필드. 정책은 [`16-payment-refund-policy.md`](./16-payment-refund-policy.md).

| 기능 | 세부기능 | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-06-01 구매 주문 생성 | 상품 구매 헤더(정가/할인/실판매가) 기록 | MVP | manager | `purchases`(`list_amount`,`discount_amount`,`final_amount`,`seller_staff_id`) |
| F-06-02 현장 카드결제 기록 | 카드 결제·승인번호 입력 | MVP | info_staff | `payments`(`payment_method=card_onsite`,`card_approval_no`) |
| F-06-03 계좌이체 기록 | 이체 결제·입금자명 기록 | MVP | info_staff | `payments`(`payment_method=transfer`,`depositor_name`) |
| F-06-04 무통장입금 처리 | 입금대기→입금확인 전환 | MVP | info_staff | `payment_status`(`awaiting_deposit`→`paid`) |
| F-06-05 현금 결제 기록 | 현금 수납 기록 | MVP | info_staff | `payment_method=cash` |
| F-06-06 결제 상태 관리 | 결제완료/입금대기/일부입금/미수금/환불완료 | MVP | manager | `payment_status`(§3.10: `paid`/`awaiting_deposit`/`partial`/`receivable`/`refunded`) |
| F-06-07 결제 상세 필드 | 결제일·수단·금액·상품명·담당자·메모 | MVP | manager | `payments`(`paid_at`,`amount`,`staff_id`,`memo`) |
| F-06-08 일부입금/미수금 | 실수령액·미수금액 분리 관리 | MVP | accountant | `payments`(`paid_amount`,`receivable_amount`), 정책 `allow_receivable`(§6.3) |
| F-06-09 미수금 회원 관리 | 미수 회원 목록·독촉 대상 추출 | MVP | manager | `payment_status in (receivable,partial)`, `tag=receivable` |
| F-06-10 결제↔통장입금 매칭 | 계좌이체 결제와 통장 입금 거래 연결 | 2차 | accountant | `bank_transactions.matched_ref_type=payment` |
| F-06-11 일/월별 결제 리포트 | 기간별 결제 합계·수단별 분해 | MVP | accountant | `payments`, `financial_reports` |
| F-06-12 PG 온라인 결제 | PG 승인·웹훅 처리 | 3차 | member | `payments`(`payment_method=online`,`payment_provider`,`external_payment_id`) |
| F-06-13 미수금 알림 | 미수 회원 자동 안내 | 2차 | manager | `notification_type=receivable` |
| F-06-14 카드수수료 추정 | 카드결제 수수료 추정·매출원가 반영 | 2차 | accountant | 정책 `card_fee_rate`(§6.3), `card_sales.fee_amount` |

---

## M07. 환불 관리 (원본 §4·§5)

> 부분/전액 환불, 위약 공제, 잔여횟수 회수, 매출 차감 반영. 모든 환불은 감사기록 필수(canon §1·§5).

| 기능 | 세부기능 | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-07-01 환불 신청/접수 | 환불 요청 생성(사유 기록) | MVP | manager | `refunds`(`status=requested`,`refund_reason`) |
| F-07-02 부분/전액 환불 | 사용분 공제 후 부분 또는 전액 처리 | MVP | manager | `refunds.refund_amount`(M05 산식) |
| F-07-03 환불 수단 지정 | 카드취소/계좌이체/현금 환불 | MVP | accountant | `refunds.refund_method`(§3.11 준용) |
| F-07-04 잔여횟수 회수 | 환불 시 미소진 횟수 회수·수강권 `refunded` | MVP | manager | `refunds.restored_count`, `pass_status=refunded` |
| F-07-05 환불 완료 처리 | 실지급 완료·결제 상태 갱신 | MVP | accountant | `refunds.status=completed`, `payment_status=refunded` |
| F-07-06 매출 차감 반영 | 결제기준 매출에 음수 레코드 자동 생성 | MVP | accountant | `revenue_records`(`source_type=refund`, `amount`<0, canon §4.1) |
| F-07-07 환불 감사기록 | 환불 전/후 스냅샷 audit 기록 | MVP | owner | `audit_logs`(`action=refund`) |
| F-07-08 환불 취소(철회) | 잘못된 환불 철회 처리 | 2차 | owner | `refunds.status=canceled` |

---

## M08. 매출 관리 (원본 §6) — 이중 손익 핵심

> **결제 기준**과 **수업 소진 기준** 두 축으로 매출을 인식한다. 한 결제는 결제기준 1건 + 소진될 때마다 소진기준 N건을 만든다. 기준별로만 합산(중복 합산 금지). 상세는 canon §4.

| 기능 | 세부기능 | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-08-01 결제기준 매출 인식 | 결제 시점 실수령액 매출 인식 | MVP | accountant | `revenue_records`(`revenue_basis=payment`,`source_type=payment`,`amount=paid_amount`) |
| F-08-02 소진기준 매출 인식 | 차감 발생 시 단가만큼 매출 인식 | MVP | accountant | `revenue_records`(`revenue_basis=consumption`,`source_type=consumption`,`amount=unit_price_amount`) |
| F-08-03 환불 차감 | 환불 시 음수 매출 자동 반영 | MVP | accountant | `revenue_records`(`source_type=refund`,`amount`<0) |
| F-08-04 순매출 산출 | 기준별 (매출−환불) 합계 | MVP | accountant | Σ`revenue_records.amount`(canon §4.4) |
| F-08-05 상품별 매출 | 상품 단위 매출 집계 | MVP | accountant | `revenue_records.product_id` |
| F-08-06 회원별 누적 매출 | 회원 LTV 산정 기초 | 2차 | accountant | `revenue_records.member_id` |
| F-08-07 강사별 담당 매출 | 소진기준 강사 귀속 매출 | 2차 | accountant | `revenue_records.instructor_staff_id`(소진기준만 분해 가능) |
| F-08-08 수업유형별 매출 | 1:1/그룹/체험/기타 분해 | 2차 | accountant | `revenue_records.class_type`(§3.3) |
| F-08-09 유입경로별 매출 | 마케팅 경로 귀속 매출 | 2차 | accountant | `revenue_records.marketing_source`(§3.16) |
| F-08-10 신규/재등록 매출 | 신규회원 vs 재등록 매출 구분 | 2차 | accountant | `revenue_records`(`is_new_member`,`is_re_enroll`) |
| F-08-11 월별 매출 추이 | 기간 시계열·전월 대비 | MVP | owner | `revenue_records.recognized_date` |
| F-08-12 카드매출 3단계 구조 | 승인일/매입일/입금일 추적 | 2차 | accountant | `card_sales.reconciliation_stage`(§3.21: `approved`/`captured`/`deposited`) |
| F-08-13 기준 토글 비교 | 결제기준↔소진기준 동시 비교 뷰 | 2차 | owner | `revenue_basis`(§3.12) 토글 |

### 두 기준 비교(쉬운 설명)

| 보는 사람 질문 | 결제기준(`payment`) | 소진기준(`consumption`) |
|---|---|---|
| "이번 달 돈이 얼마 들어왔나?" | ✅ 들어온 결제액 | △ 실제 들어온 돈과 다를 수 있음 |
| "이번 달 실제 수업으로 번 돈은?" | △ 미사용분 포함 과대표시 | ✅ 사용한 만큼만 |
| "강사별로 얼마 벌었나?" | ✖ 분해 불가 | ✅ 회차별 강사 귀속 |

```
순매출(선택 basis) = Σ revenue_records.amount   where revenue_basis = 선택값   # 환불 음수 포함
```

---

## M09. 비용 관리 (원본 §7)

> 통장 출금·카드 사용·수동 입력을 통합한 비용 원장, 17종 카테고리·고정/변동 구분, 거래처명 자동분류(수정 규칙은 다음 거래부터 자동 적용). 정책은 [`18-expense-category-policy.md`](./18-expense-category-policy.md).

| 기능 | 세부기능 | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-09-01 수동 비용 입력 | 비용 직접 등록(카테고리·금액·거래처·일자) | MVP | accountant | `expense_records`(`source=manual`,`expense_category`,`amount`,`vendor_name`,`expense_date`) |
| F-09-02 통장 출금 비용화 | 통장 출금 거래를 비용으로 분류 | 2차 | accountant | `expense_records.bank_transaction_id`→`bank_transactions`, `source=bank` |
| F-09-03 카드 사용 비용화 | 카드 지출 거래를 비용으로 분류 | 2차 | accountant | `expense_records.card_expense_id`→`card_expenses`, `source=card` |
| F-09-04 17종 카테고리 | 임대료~기타 17종 기본 카테고리 | MVP | accountant | `expense_category`(§3.13 전 17종) |
| F-09-05 고정비/변동비 구분 | 카테고리별 기본 성격 + 건별 오버라이드 | MVP | accountant | `cost_type`(§3.14: `fixed`/`variable`), `expense_categories.default_cost_type` |
| F-09-06 거래처명 자동분류 | 거래처명 패턴→카테고리/성격 자동 매핑 | 2차 | accountant | `transaction_matching_rules`(`pattern`,`expense_category`,`cost_type`) |
| F-09-07 규칙 학습 적용 | 관리자 수정 규칙을 다음 거래부터 자동 적용 | 2차 | accountant | `transaction_matching_rules`(`is_active`,`priority`) |
| F-09-08 반복 비용 등록 | 임대료·통신비 등 매월 자동 생성 | 2차 | accountant | `expense_records.is_recurring=true` |
| F-09-09 증빙 파일 첨부 | 영수증/세금계산서 이미지 첨부 | MVP | accountant | `expense_records.receipt_file_url` |
| F-09-10 증빙 메모 | 세금계산서/현금영수증/카드영수증 메모 | MVP | accountant | `expense_records.doc_memo` |
| F-09-11 강사료 비용 귀속 | 정산 강사료를 강사 귀속 비용으로 기록 | 2차 | accountant | `expense_records`(`expense_category=instructor_fee`,`staff_id`) |
| F-09-12 카테고리 커스텀 | 샵별 카테고리 추가·정렬·비활성 | 2차 | owner | `expense_categories`(`is_active`,`sort_order`) |
| F-09-13 비용 월별 리포트 | 카테고리·고정/변동별 합계 | MVP | accountant | `expense_records`, `financial_reports` |

---

## M10. 통장/카드 내역 연동 (원본 §9)

> MVP는 CSV 업로드 + 수동/추천 매칭, 2차는 오픈뱅킹·카드조회 대비 스키마, 3차는 실연동. 정책은 [`17-reconciliation-policy.md`](./17-reconciliation-policy.md).

| 기능 | 세부기능 | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-10-01 통장 거래내역 CSV 업로드 | 입출금 내역 일괄 적재 | MVP | accountant | `bank_transactions`(`import_batch_id`,`direction`,`amount`) |
| F-10-02 카드 사용내역 CSV 업로드 | 사업자 카드 지출 일괄 적재 | MVP | accountant | `card_expenses`(`import_batch_id`,`vendor_name`,`amount`) |
| F-10-03 카드매출 입금 수동 등록 | 카드 입금건 수동 입력 | MVP | accountant | `card_sales`(`reconciliation_stage`,`deposited_at`) |
| F-10-04 입금자명↔회원명 매칭 | 계좌이체 입금자명으로 회원 결제 연결 | MVP | accountant | `bank_transactions.counterparty_name` ↔ `payments.depositor_name` |
| F-10-05 자동 추천 매칭 | 금액/날짜/이름 기준 매칭 후보 추천 | MVP(추천)/2차(자동) | accountant | `bank_transactions`(`is_matched`,`match_target`) |
| F-10-06 미매칭 거래 목록 | 분류 안 된 거래 워크리스트 | MVP | accountant | `is_matched=false` |
| F-10-07 수동 분류 | 매출/비용/이체/기타로 직접 분류 | MVP | accountant | `match_target`(§3.19: `revenue`/`expense`/`transfer`/`etc`) |
| F-10-08 거래 매칭 규칙 | 거래처명 규칙으로 자동 분류 | 2차 | accountant | `transaction_matching_rules`(`match_type` `exact`/`contains`/`regex`) |
| F-10-09 매칭 이력 로그 | 누가 무엇을 어떻게 매칭했는지 | 2차 | accountant | `transaction_reconciliation_logs`(`action`,`before_json`,`after_json`) |
| F-10-10 카드매출 입금 대조 | 승인→매입→입금 3단계 대조 | 2차 | accountant | `card_sales.reconciliation_stage`(§3.21), `bank_transaction_id` |
| F-10-11 미입금 카드매출 추적 | 아직 통장 입금 안 된 카드매출 합 | 2차 | owner | Σ`card_sales.net_deposit_amount where stage != deposited`(canon §4.4) |
| F-10-12 통장 잔액 스냅샷 | 현재 잔액 표시(강사 접근 불가) | 2차 | owner | `bank_accounts.balance_amount`, RBAC §5(강사 불가) |
| F-10-13 오픈뱅킹 연동 | 금융결제원 오픈뱅킹 자동 수집 | 3차 | owner | `bank_accounts.is_open_banking_linked`, `external_integrations(provider=open_banking)` |
| F-10-14 카드매출 통합조회 | 카드사 매출 자동 수집 | 3차 | accountant | `card_sales`, `external_integrations(provider=card_lookup)` |
| F-10-15 동기화 실패 로그 | 외부 수집 성공/부분/실패 이력 | 2차 | owner | `sync_logs`(`status` `success`/`partial`/`failed`) |

### 카드매출 3단계 (쉬운 설명 + 추적식)

> "카드로 긁었다(승인) → 카드사가 정산 잡았다(매입) → 며칠 뒤 내 통장에 들어왔다(입금)." 입금 전까지는 **아직 못 받은 돈**이다.

```
실입금예정액(net_deposit_amount) = card_sales.amount − fee_amount   # fee ≈ amount × card_fee_rate(0.023)
미입금 카드매출 = Σ net_deposit_amount   where reconciliation_stage != 'deposited'
```

---

## M11. 수익분석 (원본 §8) — 솔루션 최우선 차별화

> 결제/소진 두 기준 손익을 모두 제공하고 예측·1인당·CAC/LTV·전환율까지 산출. 지표 정의는 [`19-metrics.md`](./19-metrics.md), 대시보드는 [`10-profit-dashboard.md`](./10-profit-dashboard.md).

| 기능 | 세부기능 | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-11-01 총매출/환불/순매출 | 기준별 매출 핵심 3종 | MVP | owner | `revenue_records`, `revenue_basis` |
| F-11-02 총비용/고정비/변동비 | 비용 합계·성격 분해 | MVP | owner | `expense_records.cost_type` |
| F-11-03 광고비/강사료/카드수수료 | 주요 비용 항목 별도 표시 | MVP | accountant | `expense_category`(`advertising`/`instructor_fee`/`payment_fee`) |
| F-11-04 영업이익/영업이익률 | 이익·이익률 산출 | MVP | owner | 산식 §4.4 |
| F-11-05 현재 통장 잔액 | 실시간 잔액 표시 | 2차 | owner | `bank_accounts.balance_amount` |
| F-11-06 미입금 카드매출 | 입금 전 카드매출 합 | 2차 | owner | M10 식 |
| F-11-07 미수금 | 미수금 합계 | MVP | accountant | Σ`payments.receivable_amount`(§4.4) |
| F-11-08 예상 지출 | 고정비+예약 비용 기준 잔여월 지출 추정 | 2차 | owner | `expense_records`(`is_recurring`), 예측 §19 |
| F-11-09 월말 예상 매출/이익/현금잔고 | 추세 기반 월말 예측 3종 | 2차 | owner | 예측 모델 §19 |
| F-11-10 1:1/그룹 수익성 | 수업유형별 매출−원가 | 2차 | owner | `revenue_records.class_type`, `expense_records` |
| F-11-11 강사별 수익성 | 강사 귀속 매출−강사료 | 2차 | owner | `revenue_records.instructor_staff_id`, `settlements` |
| F-11-12 유입경로별 수익성 | 경로별 매출−광고비(ROAS) | 2차 | accountant | `marketing_source`, `expense_category=advertising` |
| F-11-13 1인당 평균 매출/이익 | 회원 수 대비 평균 | 2차 | owner | `revenue_records.member_id` |
| F-11-14 신규회원 CAC | 광고비÷신규등록 수 | 2차 | accountant | `advertising` ÷ 신규 `enrolled` |
| F-11-15 회원 LTV | 회원 누적 기여 매출 | 2차 | accountant | `revenue_records.member_id` 누적 |
| F-11-16 재등록률 | 만료 대비 재등록 비율 | 2차 | owner | `member_status=re_enrolled` |
| F-11-17 체험 등록전환율 | 체험완료→등록 비율 | 2차 | owner | `lead_status`(`trial_done`→`enrolled`) |
| F-11-18 기준 토글 손익 | 결제기준↔소진기준 손익 동시 | 2차 | owner | `revenue_basis` 토글 |
| F-11-19 세무용 리포트 내보내기 | 월간 손익·현금흐름 export | 3차 | accountant | `financial_reports`(`report_type` `monthly_pl`/`cashflow`/`tax_export`) |

### 핵심 산식 모음(쉬운 설명 병기)

```
영업이익     = 순매출 − 총비용                      # "번 돈에서 쓴 돈 빼면 진짜 이익"
영업이익률   = 영업이익 ÷ 순매출                    # "100원 팔아 몇 원 남았나"
신규회원 CAC = 광고비 합 ÷ 신규 등록 회원 수        # "한 명 데려오는 데 든 돈"
회원 LTV     = Σ 해당 회원 revenue_records.amount   # "이 회원이 평생 안겨준 매출"
재등록률     = 재등록 회원 수 ÷ 만료 도래 회원 수
체험전환율   = 등록(enrolled) ÷ 체험완료(trial_done)
```

---

## M12. 알림 자동화 (원본 §11)

> 13종 알림 유형을 템플릿·채널·이력으로 관리.
> **단계 경계(canon §6.4 정렬, 07-ia §7 / 12-api §13와 동일)**: **알림 템플릿 관리·발송 이력 조회 등 인앱(in-app) 표시 화면은 MVP**, **SMS 실발송은 2차**, 카카오 알림톡/푸시/이메일 채널 확장은 2차다. 즉 MVP에서는 템플릿(`notification_templates`)을 정의하고 발송 이력(`notifications`)을 인앱으로 조회·관리하되 외부 실발송은 하지 않으며(스키마·인앱만), 실제 SMS 발송 트리거는 2차에서 활성화한다. `default_channel`은 `sms`(2차)다.

| 기능 | 세부기능 | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-12-01 알림 템플릿 관리 | 유형별 본문·변수치환·채널 설정 (템플릿 CRUD 인앱 화면) | MVP(인앱/템플릿)·2차(실발송) | manager | `notification_templates`(`body_template`,`channel`) |
| F-12-02 예약 완료 알림 | 예약 확정 시 발송 | 2차 | member | `notification_type=reservation_done` |
| F-12-03 예약 전 리마인드 | 수업 전 N분 리마인드 | 2차 | member | `reservation_reminder`, `reminder_before_minutes`(§6.4) |
| F-12-04 예약 취소 알림 | 취소 시 발송 | 2차 | member | `reservation_canceled` |
| F-12-05 대기 확정 알림 | 대기→확정 전환 시 | 2차 | member | `waitlist_promoted` |
| F-12-06 수강권 만료 예정 | 만료 N일 전 안내 | 2차 | member | `pass_expiring`, `expiring_alert_days`(§6.2) |
| F-12-07 잔여횟수 부족 | 임계 이하 시 안내 | 2차 | member | `pass_low_count`, `low_count_threshold` |
| F-12-08 장기 미방문 | 기준일 초과 미방문 회원 | 2차 | manager | `long_absence`, `long_absence_days`(§6.4) |
| F-12-09 체험 전 안내 | 체험 예약자 사전 안내 | 2차 | member | `trial_guide` |
| F-12-10 체험 후 등록 상담 | 체험완료 후 등록 유도 | 2차 | info_staff | `trial_followup` |
| F-12-11 재등록 안내 | 만료/재등록유력 회원 대상 | 2차 | manager | `re_enroll` |
| F-12-12 미수금 안내 | 미수 회원 독촉 | 2차 | manager | `receivable` |
| F-12-13 리뷰 요청 | 출석 후 리뷰 유도 | 2차 | member | `review_request` |
| F-12-14 상담 리마인드 | 상담 다음 액션 알림 | 2차 | info_staff | `counseling_reminder` |
| F-12-15 발송 이력/실패 관리 | 발송·예약·실패 상태 추적 (이력 인앱 조회 화면) | MVP(인앱/조회)·2차(실발송) | manager | `notifications`(`status` `scheduled`/`sent`/`failed`/`canceled`,`error_message`) |
| F-12-16 채널 확장 | SMS→카카오 알림톡/푸시/이메일 | 2차 | owner | `channel`(`sms`/`kakao`/`push`/`email`), `default_channel`(§6.4) |
| F-12-17 알림톡 연동 | 카카오 알림톡 외부 연동 | 2차 | owner | `external_integrations(provider=kakao_alimtalk)` |

> 알림 유형 13종은 원본 §11 목록 = canon §3.20 `notification_type` 13종(`reservation_done` 외)과 일치한다(상담 리마인드 `counseling_reminder` 포함 시 14종 정의).

---

## M13. 강사 관리 (원본 §12)

> 강사 프로필·근무시간·담당 수업·실적(예약률/출석률/노쇼율/재등록 기여/매출)·정산·회원 코멘트·운동일지.

| 기능 | 세부기능 | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-13-01 강사 프로필 | 이름·연락처·역할·고용형태 | MVP | manager | `staff`(`role=instructor`,`employment_type`) |
| F-13-02 근무 가능 시간 | 강사별 가용 시간 등록 | MVP | manager | `staff.available_hours_json` |
| F-13-03 담당 수업 조회 | 본인 담당 회차·출석부 | MVP | instructor | `class_sessions.instructor_staff_id`(scope=assigned) |
| F-13-04 수업 이력 | 강사별 진행 수업 이력 | MVP | manager | `class_sessions`, `attendance` |
| F-13-05 출석 기준 수업 수 | 정산 기준 실제 진행 회차 수 | 2차 | accountant | `settlements.session_count`(출석 기준) |
| F-13-06 예약률/출석률/노쇼율 | 강사별 운영 지표 | 2차 | owner | `reservations`,`attendance`(`attendance_status`) |
| F-13-07 재등록 기여도 | 담당 회원 재등록 기여 | 2차 | owner | `member_status=re_enrolled`, `assigned_staff_id` |
| F-13-08 강사별 매출 | 소진기준 강사 귀속 매출 | 2차 | accountant | `revenue_records.instructor_staff_id` |
| F-13-09 예상 정산금 | 기간 강사료 추정 | 2차 | accountant | `settlements`(`base_amount`+`bonus_amount`−`deduction_amount`=`total_amount`) |
| F-13-10 강사료 정산 방식 | 회당/비율/고정 등 정산 방식 | 2차 | owner | `staff.settlement_method` |
| F-13-11 정산 확정/지급 | 정산 상태 전이 | 2차 | accountant | `settlements.status`(`draft`/`confirmed`/`paid`) |
| F-13-12 강사별 회원 코멘트 | 회원별 코멘트(권한 분리) | 2차 | instructor | `instructor_comments`(scope=assigned) |
| F-13-13 운동일지 | 회원 수업별 수행 기록 | 2차 | instructor | `exercise_logs`(`metrics_json`) |
| F-13-14 매출/통장 접근 차단 | 강사 전체 매출·통장 잔액 불가 | MVP | owner | RBAC §5(instructor 통장 잔액 불가) |

### 강사 정산금 산식

```
total_amount = base_amount + bonus_amount − deduction_amount
# 예) 회당정산: base_amount = session_count × 회당단가
#     보너스:   bonus_amount = (재등록 기여·목표 달성 인센티브)
#     공제:     deduction_amount = (지각·결강 공제 등)
```

---

## M14. 관리자 대시보드 (원본 §13) — 4영역

> 원장이 **오늘 운영 + 이번 달 수익을 10초 안에** 파악. 4영역으로 구성. 화면 상세는 [`09-admin-dashboard.md`](./09-admin-dashboard.md).

| 기능(영역) | 세부기능(카드) | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-14-01 ① 오늘의 운영 | 오늘 수업·오늘 예약 인원·잔여석 | MVP | owner | `class_sessions`,`reservations`(오늘 `start_at`) |
| F-14-02 ① 오늘의 운영 | 체험 예약·신규 상담 건수 | MVP | manager | `leads`(`trial_booked`/`new_inquiry`) |
| F-14-03 ① 오늘의 운영 | 노쇼 위험·만료 예정·미수금 회원 | MVP | manager | `tag`(`no_show_risk`/`expiring`/`receivable`) |
| F-14-04 ② 이번 달 매출 | 총매출·환불·순매출 | MVP | owner | `revenue_records` |
| F-14-05 ② 이번 달 매출 | 1:1·그룹·체험·기타 | 2차 | owner | `class_type` |
| F-14-06 ② 이번 달 매출 | 신규회원·재등록 매출 | 2차 | owner | `is_new_member`/`is_re_enroll` |
| F-14-07 ③ 이번 달 비용 | 총비용·고정비·변동비 | MVP | owner | `expense_records.cost_type` |
| F-14-08 ③ 이번 달 비용 | 광고비·강사료·결제수수료·임대료·소모품비·공과금·기타 | MVP | accountant | `expense_category` |
| F-14-09 ④ 이번 달 수익 | 영업이익·영업이익률 | MVP | owner | 산식 §4.4 |
| F-14-10 ④ 이번 달 수익 | 통장 잔액·미입금 카드매출·미수금 | 2차 | owner | `bank_accounts`,`card_sales`,`payments` |
| F-14-11 ④ 이번 달 수익 | 예상 지출·월말 예상 이익 | 2차 | owner | 예측 §19 |
| F-14-12 대시보드 기준 토글 | 결제기준/소진기준 전환 | 2차 | owner | `revenue_basis` |
| F-14-13 SaaS 전체 대시보드 | 다지점·테넌트 통합 현황 | 3차 | saas_admin | `tenants`,`studios` 집계 |

---

## M15. 권한·감사 관리 (원본 §14)

> 7종 역할 RBAC + 테넌트/스튜디오 격리 + 모든 금전 변경 audit. 상세는 canon §5 / [`13-rbac.md`](./13-rbac.md).

| 기능 | 세부기능 | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-15-01 7종 역할 정의 | SaaS관리자/오너/관리자/인포/강사/회계/회원 | MVP | owner | `role`(§3.18 7종), `roles` |
| F-15-02 역할-권한 매핑 | 리소스×액션×스코프 매트릭스 | MVP | owner | `permissions`(`resource`,`action`,`scope`) |
| F-15-03 스코프 격리 | all/assigned/own 범위 제한 | MVP | owner | `permissions.scope`(`all`/`own`/`assigned`) |
| F-15-04 테넌트/스튜디오 격리 | 모든 쿼리 `tenant_id`+`studio_id` 필터 | MVP | owner | 공통 컬럼(canon §1.2) |
| F-15-05 강사 제한 | 담당 수업/회원 메모만, 매출·통장 불가 | MVP | owner | RBAC §5(instructor) |
| F-15-06 회원 제한 | 본인 예약/수강권/출석만 | MVP | owner | scope=own |
| F-15-07 사용자 초대/상태 | 직원/강사/회원 계정 초대·정지 | MVP | manager | `users.status`(`active`/`invited`/`suspended`) |
| F-15-08 감사 로그 기록 | 수정/삭제/환불/수강권 차감 전후 기록 | MVP | owner | `audit_logs`(`action` `update`/`delete`/`refund`/`pass_adjust`/`match`/`login`/`export`) |
| F-15-09 감사 로그 조회 | 누가 언제 무엇을 변경했는지 추적 | MVP | owner | `audit_logs`(append-only) |
| F-15-10 소프트 삭제 | 금전·감사 데이터 물리삭제 금지 | MVP | owner | `deleted_at`(canon §1.2) |
| F-15-11 개인/결제/수익 분리 | 민감정보 권한별 노출 제한 | MVP | owner | RBAC §5 |

---

## M16. SaaS·연동·인프라 (원본 §15·§9-2/3차)

> multi-tenant 데이터 분리, 샵별 요금제·기능 제한, 외부 연동(오픈뱅킹/PG/알림톡/카드조회), 구독 과금. 상세는 [`20-saas-architecture.md`](./20-saas-architecture.md).

| 기능 | 세부기능 | 단계 | 대표 역할 | 관련 테이블/enum |
|---|---|---|---|---|
| F-16-01 멀티테넌시 | 테넌트(브랜드/사업자) 단위 분리 | MVP | saas_admin | `tenants`, `tenant_id` |
| F-16-02 다지점(스튜디오) | 테넌트 하위 지점별 데이터 분리 | MVP(스키마)/3차(운영) | owner | `studios`, `studio_id` |
| F-16-03 샵별 설정 오버라이드 | 지점별 정책·타임존 설정 | MVP | owner | `studios`(`timezone`,`policy_json`) |
| F-16-04 샵별 사용자/데이터 분리 | 사용자/회원/수업/결제/비용 분리 | MVP | owner | 공통 컬럼 |
| F-16-05 요금제 정의 | SaaS 요금제·기능 한도 | 3차 | saas_admin | `subscription_plans`(`feature_limits_json`,`billing_cycle`) |
| F-16-06 구독 계약 | 테넌트 구독·기간·상태 | 3차 | saas_admin | `tenant_subscriptions`(`status` `trial`/`active`/`past_due`/`canceled`/`suspended`) |
| F-16-07 기능 제한 적용 | 스튜디오 수·알림 발송량·연동 한도 | 3차 | saas_admin | `feature_limits_json` |
| F-16-08 사용량 기반 과금 | 사용량 누적·차기 과금 | 3차 | saas_admin | `tenant_subscriptions`(`usage_json`,`next_billing_at`) |
| F-16-09 데이터 백업 | 샵별 백업·복구 | 3차 | saas_admin | (인프라) |
| F-16-10 외부 연동 설정 | 오픈뱅킹/PG/알림톡/카드조회/홈택스 | 2~3차 | owner | `external_integrations`(`provider`,`status`) |
| F-16-11 동기화 이력 | 외부 연동 실행/실패 로그 | 2차 | owner | `sync_logs` |
| F-16-12 전자계약/네이버예약 | 전자계약·네이버 예약/플레이스 연동 | 3차 | owner | `external_integrations` |
| F-16-13 외부 샵 온보딩 | 신규 샵 셀프 온보딩 | 3차 | saas_admin | `tenants`,`studios` |
| F-16-14 SaaS 관리자 대시보드 | 전 테넌트 운영·과금 현황 | 3차 | saas_admin | 글로벌 집계 |

---

## 99. 부록 — 모듈 ↔ 원본 매핑 / 단계별 집계

### A. 원본 §1~§16 ↔ 본 문서 모듈 대조

| 원본 절 | 영역 | 본 문서 모듈 |
|---|---|---|
| §1 회원 관리 | 회원 | M01 |
| §10 상담 CRM | CRM | M02 |
| §2 수업 관리 | 수업 | M03 |
| §3 예약 관리 | 예약 | M04 |
| §4 수강권/상품 | 수강권 | M05(상품·수강권), M07(환불 계산) |
| §5 결제 관리 | 결제 | M06, M07(환불) |
| §6 매출 관리 | 매출 | M08 |
| §7 비용 관리 | 비용 | M09 |
| §9 통장/카드 연동 | 연동 | M10 |
| §8 수익분석 | 수익분석 | M11 |
| §11 알림 자동화 | 알림 | M12 |
| §12 강사 관리 | 강사 | M13 |
| §13 관리자 대시보드 | 대시보드 | M14 |
| §14 권한 관리 | 권한 | M15 |
| §15 SaaS 확장 | SaaS | M16 |
| §16 DB 테이블 | 전체 | M01~M16 전반(테이블 매핑) |

> 원본이 명시한 "16개 모듈(회원/수업/예약/수강권/결제/매출/비용/수익분석/연동/CRM/알림/강사/대시보드/권한/SaaS)" 전부를 M01~M16으로 빠짐없이 수록했다(환불은 결제/수강권에서 파생되어 M07로 독립 정리).

### B. 단계별 세부기능 분포(요약)

| 단계 | 주요 포함 영역 | 대표 모듈 |
|---|---|---|
| **MVP** | 회원·CRM·수업·예약·수강권·결제/환불·기본 매출/비용/손익·CSV업로드·수동매칭·권한/감사·테넌시 스키마·알림 템플릿/이력 인앱 화면(F-12-01·F-12-15, 실발송 제외) | M01~M09, M10(일부), M11(기본), M12(인앱 템플릿/이력), M14(기본), M15, M16(스키마) |
| **2차** | 자동분류·입금 자동매칭·카드매출 대조·반복비용·예측손익·수익성 분해·재등록 자동화·SMS 실발송/알림톡·운동일지/코멘트 | M02·M08·M09·M10·M11·M12(실발송 트리거·채널 확장)·M13 자동화 행 |
| **3차** | 오픈뱅킹·카드매출 조회·PG 온라인결제·전자계약·네이버예약·다지점 운영·SaaS 요금제·외부 온보딩·세무 리포트 | M06(PG)·M10(오픈뱅킹)·M11(세무 export)·M16(SaaS 과금) |

### C. 핵심 차별화 재확인

본 카탈로그의 **M08(이중 손익 매출)·M11(수익분석)·M10(통장/카드 매칭)** 은 벤치마크 대비 우리 솔루션의 차별점이며, 원본 §18·주의사항에 따라 **가장 중요하게** 설계한다. 결제기준 vs 소진기준은 모든 매출/수익 화면에서 항상 구분 표시한다(canon §4).

---

## 관련 문서

- [`00-canon.md`](./00-canon.md) — 단일 진실원천(스키마·enum·RBAC·회계모델·정책 기본값)
- [`_source-requirements.md`](./_source-requirements.md) — 원본 요구사항(정본)
- [`01-overview.md`](./01-overview.md) — 서비스 개요
- [`05-scope-mvp.md`](./05-scope-mvp.md) — MVP 범위(본 카탈로그의 MVP 태그 셀렉션)
- [`06-scope-phases.md`](./06-scope-phases.md) — 2차/3차 확장 범위
- [`09-admin-dashboard.md`](./09-admin-dashboard.md) — 관리자 대시보드(M14 상세)
- [`10-profit-dashboard.md`](./10-profit-dashboard.md) — 수익분석 대시보드(M11 상세)
- [`11-erd.md`](./11-erd.md) — ERD(테이블 매핑 상세)
- [`13-rbac.md`](./13-rbac.md) — 권한 정책(M15 상세)
- [`14-booking-policy.md`](./14-booking-policy.md) · [`15-pass-policy.md`](./15-pass-policy.md) · [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) — 정책 상세(M04·M05·M06·M07)
- [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) · [`18-expense-category-policy.md`](./18-expense-category-policy.md) — 매칭·비용 정책(M10·M09)
- [`19-metrics.md`](./19-metrics.md) — 수익분석 지표 산식(M11 상세)
- [`20-saas-architecture.md`](./20-saas-architecture.md) — SaaS 아키텍처(M16 상세)
- [`21-roadmap.md`](./21-roadmap.md) — 개발 우선순위(단계 태그 일정화)
