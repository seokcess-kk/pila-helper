# 05-scope-mvp.md — MVP 범위

> **목적**: 원본 요구사항 §17의 "MVP 필수" 전 항목을, **사용자스토리(역할/원함/이유) + 수용기준(Given-When-Then)** 형식으로 정의하여 무엇을 만들고 무엇을 미루는지 한 치의 모호함 없이 확정한다. 클라이언트는 **회원 모바일웹 + 관리자 웹** 두 가지뿐이다.

본 문서는 [`00-canon.md`](./00-canon.md)를 계약으로 따른다. 테이블명·컬럼명·enum 코드·역할명·카테고리명은 모두 CANON과 글자 단위로 일치한다. 충돌 시 CANON이 우선한다.

---

## 0. MVP 정의와 원칙

### 0.1 MVP 한 줄 정의

> **"신규 필라테스 샵 1개 지점이, 회원 모바일웹 예약과 관리자 웹만으로 — 회원·상담·수업·예약·출석·횟수권·수동결제·미수금·CSV 기반 비용/통장/카드 입력까지 끝내고, 결제기준/소진기준 이중 손익을 10초 안에 확인할 수 있는 상태."**

### 0.2 MVP 범위 산정 원칙 (원본 §17 + §18 UX 원칙 근거)

| 원칙 | 근거 | MVP 적용 |
|---|---|---|
| **데이터 구조는 SaaS·금융연동 확장 가능하게** | §43, §187 | 스키마는 CANON 전체(42 테이블)를 그대로 사용. 단 MVP **기능**은 일부 테이블만 쓰기/읽기 활성화. `tenant_id`+`studio_id`는 단일 지점이라도 항상 채운다. |
| **수동 입력·CSV 우선, 자동연동은 뒤로** | §102~104, §152~155 | 오픈뱅킹·PG·카드매출 자동조회·알림톡 발송은 MVP 제외. 통장/카드 CSV 업로드와 **수동** 입력은 MVP 포함. |
| **수익분석은 핵심 차별화 → MVP에서도 양 기준 제공** | §97~99, §188 | `revenue_basis` = `payment`/`consumption` 두 기준 모두 MVP에서 인식·표시. (강사별/유입경로별 "수익성" 분해는 2차) |
| **3클릭 / 30초 / 10초 UX** | §162~164 | 관리자 핵심 입력 3클릭, 회원 예약 30초, 원장 대시보드 10초를 수용기준에 반영. |
| **모든 금전 변경은 로그** | §135, §170 | 수정·삭제·환불·수강권 차감은 MVP부터 `audit_logs` 적재(예외 없음). |

### 0.3 MVP가 다루는 역할 (CANON §3.18 `role` 7종 중)

| 역할 코드 | 라벨 | MVP 클라이언트 | MVP 포함 여부 |
|---|---|---|---|
| `owner` | 샵 오너 | 관리자 웹 | ✅ |
| `manager` | 샵 관리자 | 관리자 웹 | ✅ |
| `info_staff` | 인포 직원 | 관리자 웹 | ✅ |
| `accountant` | 회계 담당자 | 관리자 웹 | ✅ |
| `instructor` | 강사 | 관리자 웹(제한 화면) | ✅ (담당 수업·회원 코멘트 조회 한정) |
| `member` | 회원 | 회원 모바일웹 | ✅ |
| `saas_admin` | SaaS 최고관리자 | — | ❌ MVP 제외(§6.2) |

---

## 1. MVP 사용자스토리 + 수용기준

> 표기: 사용자스토리는 **As a / I want / so that** 3요소. 수용기준은 **Given–When–Then**. 각 스토리에 **클라이언트**(M=회원 모바일웹, A=관리자 웹)와 **근거**(원본 §, CANON §)를 명시. 저장값은 영문 코드, 화면은 한글 라벨(CANON §0).

---

### 모듈 A. 회원 관리 (원본 §47~52)

#### US-A1 — 회원/상담고객 등록

- **As a** `info_staff`(인포 직원)
- **I want** 회원의 이름·연락처·성별·생년월일·유입경로·운동 목적·통증/주의사항·상담 메모를 한 화면에서 등록하고 싶다
- **so that** 첫 문의부터 등록까지 한 레코드로 끊김 없이 관리할 수 있다
- **클라이언트**: A · **근거**: 원본 §47~49 / CANON `members` §2-B6

**수용기준**

```gherkin
Given 관리자 웹에 info_staff로 로그인한 상태에서 "회원 등록" 화면을 연다
When name="김민지", phone="010-1234-5678", gender="female", birth_date="1992-03-01",
     marketing_source="instagram", goal="자세교정", medical_note="우측 어깨 통증" 을 입력하고 저장한다
Then members 레코드가 생성되고 tenant_id·studio_id·created_by 가 자동으로 채워진다
And  member_status 의 기본값은 "new_inquiry"(신규문의) 다
And  저장 동작은 화면 진입 후 3번 클릭(메뉴→등록→저장) 안에 완료된다   # 원본 §163
```

```gherkin
Given marketing_source 드롭다운을 연다
When 값 목록을 확인한다
Then CANON §3.16 의 7종(naver_place/naver_blog/instagram/referral/offline/ad/etc) 만 노출된다
And  저장 시 한글 라벨이 아니라 영문 코드가 저장된다
```

#### US-A2 — 회원 상태값 관리

- **As a** `manager`
- **I want** 회원 상태를 신규문의→상담중→체험예약→체험완료→등록완료→휴면→만료→재등록완료로 변경하고 싶다
- **so that** 회원 생애주기 단계별로 회원을 분류·필터링할 수 있다
- **클라이언트**: A · **근거**: 원본 §48 / CANON `member_status` §3.1

**수용기준**

```gherkin
Given 회원 상세 화면에서 member_status 를 변경한다
When 상태를 "trial_done"(체험완료) 에서 "enrolled"(등록완료) 로 바꾼다
Then members.member_status 가 갱신되고 audit_logs 에 action="update", before/after_json 이 기록된다
And  상태 enum 은 CANON §3.1 의 8종만 선택 가능하다
       (new_inquiry/consulting/trial_booked/trial_done/enrolled/dormant/expired/re_enrolled)
```

#### US-A3 — 회원 360 이력 조회

- **As a** `manager`
- **I want** 회원 한 명의 수강권·예약·출석·결제·환불·상담 이력을 한 화면에서 보고 싶다
- **so that** 응대 전 회원 맥락을 즉시 파악할 수 있다
- **클라이언트**: A · **근거**: 원본 §50 / CANON `passes`·`reservations`·`attendance`·`payments`·`refunds`·`counseling_logs`

**수용기준**

```gherkin
Given 회원 상세 화면을 연다
When 탭(수강권/예약/출석/결제/환불/상담)을 전환한다
Then 각 탭은 해당 member_id 로 필터된 레코드만 보여준다(타 회원 데이터 노출 0건)
And  모든 조회는 tenant_id+studio_id 로 1차 격리된 후 member_id 로 2차 필터된다   # CANON §5
```

#### US-A4 — 회원 태그(MVP는 수동 부여)

- **As a** `manager`
- **I want** 회원에게 노쇼주의/재등록유력/장기미방문/VIP/체험고객/만료임박/미수금 태그를 붙이고 싶다
- **so that** 후속 응대·캠페인 대상을 빠르게 분류할 수 있다
- **클라이언트**: A · **근거**: 원본 §51 / CANON `tag` §3.17

**수용기준**

```gherkin
Given 회원 상세 화면에서 태그를 편집한다
When "no_show_risk"(노쇼주의), "vip"(VIP) 를 추가한다
Then 선택 가능한 태그는 CANON §3.17 의 7종으로 한정된다
       (no_show_risk/re_enroll_likely/long_absent/vip/trial/expiring/receivable)
And  MVP 에서는 자동 태깅이 아닌 수동 부여만 지원한다   # 자동화는 2차(원본 §157)
```

---

### 모듈 B. 상담 CRM (원본 §110~114, §17)

#### US-B1 — 신규 문의 등록과 상담 파이프라인

- **As a** `info_staff`
- **I want** 신규 문의를 유입경로·상담 상태와 함께 등록하고 상담일/체험예약일/체험완료일/등록일을 기록하고 싶다
- **so that** 문의가 등록으로 전환되는 과정을 단계별로 추적할 수 있다
- **클라이언트**: A · **근거**: 원본 §110~113 / CANON `leads` §2-B7, `lead_status` §3.2

**수용기준**

```gherkin
Given "상담 등록" 화면을 연다
When name·phone·marketing_source="naver_place" 를 입력하고 저장한다
Then leads 레코드가 lead_status="new_inquiry"(신규문의) 로 생성된다
And  lead_status 는 CANON §3.2 의 7종만 가능
       (new_inquiry/contacted/trial_booked/trial_done/enrolled/on_hold/lost)
```

```gherkin
Given 상담이 진행되어 체험을 예약했다
When lead_status 를 "trial_booked"(체험예약) 로 바꾸고 trial_booked_date 를 입력한다
Then leads.trial_booked_date 가 저장된다
And  등록 실패 시 lead_status="lost"(실패) + lost_reason 을 입력해야 저장된다
```

#### US-B2 — 상담 이력과 리마인드(기록만, 발송은 제외)

- **As a** `info_staff`
- **I want** 통화/방문/메시지 상담 내용을 시각과 함께 기록하고 다음 액션 일정을 남기고 싶다
- **so that** 다음 담당자가 이어서 상담할 수 있고 후속 누락을 막을 수 있다
- **클라이언트**: A · **근거**: 원본 §113 / CANON `counseling_logs` §2-B9

**수용기준**

```gherkin
Given 회원/리드 상세에서 "상담 기록 추가" 를 누른다
When channel="call", content="가격 안내, 화요일 체험 희망", consulted_at, next_action_at 을 입력한다
Then counseling_logs 레코드가 생성되고 staff_id 가 작성자로 기록된다
And  MVP 에서는 next_action_at 기반 자동 알림 발송은 하지 않고 화면 리스트로만 노출한다   # 알림 발송은 2차(§6.1)
```

#### US-B3 — 기본 전환율 확인(체험→등록)

- **As a** `owner`
- **I want** 기간 내 체험완료 대비 등록완료 전환율을 숫자로 보고 싶다
- **so that** 상담·체험 운영의 효율을 가늠할 수 있다
- **클라이언트**: A · **근거**: 원본 §114(체험 후 등록 전환율) / CANON `leads`

**수용기준**

```gherkin
Given 상담 현황 화면에서 이번 달 기간을 선택한다
When 전환율 카드를 본다
Then 체험→등록 전환율 = count(lead_status 가 enrolled 로 전환된 leads) ÷ count(trial_done 도달 leads) 로 계산된다
And  MVP 는 전체 전환율만 제공한다. 유입경로별 전환율 분해는 2차다   # 원본 §157 수익성 분해
```

> **계산 예**: 체험완료 20명 중 12명 등록 → 12 ÷ 20 = **60.0%**.

---

### 모듈 C. 수업 관리 — 1:1 / 그룹 (원본 §53~56, §17)

#### US-C1 — 정규 반복 수업 / 단일 수업 생성

- **As a** `manager`
- **I want** 강사·공간·정원·시간으로 1:1 개인레슨과 그룹레슨을, 반복(템플릿) 또는 단일로 만들고 싶다
- **so that** 회원이 예약할 수업 회차가 자동/수동으로 생성된다
- **클라이언트**: A · **근거**: 원본 §53~55 / CANON `class_templates` §2-C12, `class_sessions` §2-C13, `class_type` §3.3

**수용기준**

```gherkin
Given "수업 만들기" 화면을 연다
When class_type="group", instructor_staff_id, room_id, capacity=6, duration_minutes=50,
     recurrence_rule="매주 화/목 19:00" 으로 반복 수업을 만든다
Then class_templates 1건 + 향후 booking_open_days 범위의 class_sessions N건이 생성된다
And  class_type 은 CANON §3.3 의 3종(personal/group/trial) 만 가능하다
And  단일 수업은 class_template_id=NULL 인 class_sessions 1건으로 생성된다
```

```gherkin
Given 1:1 개인레슨을 만든다
When class_type="personal", capacity=1 로 설정한다
Then 해당 회차는 정원 1명으로 생성되고 2명째 예약은 정원초과 처리된다(US-E2)
```

#### US-C2 — 수업 공개/비공개·예약마감·정원

- **As a** `manager`
- **I want** 수업 회차의 공개 여부, 예약 마감 시각, 정원/대기 정원을 정하고 싶다
- **so that** 회원에게 보여줄 수업과 예약 가능 시점을 통제할 수 있다
- **클라이언트**: A · **근거**: 원본 §55~56 / CANON `class_sessions`, 정책 §6.1

**수용기준**

```gherkin
Given 수업 회차 설정에서 is_public 과 정책을 본다
When is_public=true 로 두고 booking_close_minutes=60 을 적용한다
Then 회원 모바일웹에는 is_public=true 인 회차만 노출된다
And  수업 시작 60분 전이 지나면 session_status 가 "closed"(예약마감) 로 전환되어 예약 불가다
And  미설정 시 studios.policy_json 의 기본값(booking_open_days=14, booking_close_minutes=60)이 적용된다   # CANON §6.1
```

#### US-C3 — 강사 대체 배정·자동 폐강(설정만 MVP)

- **As a** `manager`
- **I want** 회차별 대체 강사를 지정하고 최소 인원 미달 시 폐강 후보를 표시하고 싶다
- **so that** 강사 공백과 비효율 수업 운영을 관리할 수 있다
- **클라이언트**: A · **근거**: 원본 §56 / CANON `class_sessions.substitute_staff_id`, `session_status` §3.4, 정책 `auto_close_min_count` §6.1

**수용기준**

```gherkin
Given 수업 회차에 강사 공백이 생겼다
When substitute_staff_id 에 대체 강사를 지정한다
Then 해당 회차의 운영 강사로 대체 강사가 표시된다(원 instructor_staff_id 는 보존)
```

```gherkin
Given auto_close_min_count=1 인 회차에 예약이 0명이다
When 관리자가 수업 목록을 본다
Then 해당 회차가 "폐강 후보" 로 표시된다
And  MVP 에서는 자동 폐강 실행이 아니라 후보 표시 + 관리자 수동 폐강(session_status="canceled") 만 한다
```

---

### 모듈 D. 모바일 웹 예약 — 회원 (원본 §24, §41, §59, §164)

#### US-D1 — 회원 로그인(연락처 기반)과 내 수강권 확인

- **As a** `member`(회원)
- **I want** 모바일웹에 로그인해서 내 수강권 잔여횟수와 만료일을 보고 싶다
- **so that** 예약 전에 내가 쓸 수 있는 횟수가 얼마인지 알 수 있다
- **클라이언트**: M · **근거**: 원본 §25, §41 / CANON `users`(member 연결), `passes` §2-D18

**수용기준**

```gherkin
Given 회원이 모바일웹에 본인 계정으로 로그인했다
When "내 수강권" 화면을 연다
Then 본인 member_id 의 passes 중 pass_status="active" 인 것만 잔여횟수(remaining_count)·만료일(expire_date)과 함께 보인다
And  회원은 본인 데이터만 조회 가능하다(타 회원 0건)   # CANON §5 member=own
```

#### US-D2 — 수업 직접 예약 (30초 목표)

- **As a** `member`
- **I want** 공개된 수업 회차를 골라 직접 예약하고 싶다
- **so that** 전화 없이 30초 안에 원하는 시간을 잡을 수 있다
- **클라이언트**: M · **근거**: 원본 §24, §59, §164 / CANON `reservations` §2-C14, `reservation_status` §3.5

**수용기준**

```gherkin
Given 회원이 모바일웹 "수업 예약" 에서 예약가능한 회차를 본다(is_public=true, session_status in [open])
When 화요일 19:00 그룹수업을 선택하고 예약을 확정한다
Then reservations 1건이 reservation_status="booked"(예약완료), is_self_booked=true 로 생성된다
And  사용할 pass_id 가 본인 active 수강권으로 연결된다
And  예약 완료까지 30초 안에 끝나도록 단계는 (목록→회차선택→확정) 3스텝 이내다   # 원본 §164
```

```gherkin
Given deduct_timing="on_attend"(기본값) 인 스튜디오다
When 회원이 예약을 확정한다
Then 예약 시점에는 횟수가 차감되지 않는다(출석 시 차감)
And  deduct_timing="on_booking" 인 경우에만 예약 시 pass_transactions(reason="deduct_booking", delta=-1) 가 생성된다   # CANON §3.9, §6.1
```

#### US-D3 — 예약 취소 (취소마감 정책 적용)

- **As a** `member`
- **I want** 내 예약을 취소하되 취소마감 시간 전이면 무차감으로 취소하고 싶다
- **so that** 일정 변경 시 불이익 없이 자리를 비울 수 있다
- **클라이언트**: M · **근거**: 원본 §59~60 / CANON `reservation_status` §3.5, 정책 `cancel_deadline_minutes`·`late_cancel_deduct` §6.1

**수용기준**

```gherkin
Given 수업 시작 120분(cancel_deadline_minutes 기본값) 이전이다
When 회원이 예약을 취소한다
Then reservation_status="canceled", canceled_at·cancel_reason 이 기록된다
And  횟수 차감이 없다. 이미 예약 시 차감된 경우라면 pass_transactions(reason="restore_cancel", delta=+1) 로 복구된다
```

```gherkin
Given 수업 시작 120분 이내(취소마감 경과) 이고 late_cancel_deduct=true 다
When 회원이 취소한다
Then 지각취소로 분류되어 횟수가 차감된다(또는 차감 유지)
And  취소마감 정책의 상세 분기는 14-booking-policy.md 가 소유한다
```

#### US-D4 — 대기 신청과 대기 확정 알림(인앱 표시)

- **As a** `member`
- **I want** 정원이 찼을 때 대기 신청을 하고, 자리가 나면 알 수 있길 원한다
- **so that** 인기 수업도 결원 시 자동으로 잡을 수 있다
- **클라이언트**: M · **근거**: 원본 §56, §59, §61 / CANON `waitlists` §2-C15, 정책 `waitlist_auto_promote` §6.1

**수용기준**

```gherkin
Given 그룹 수업 정원이 가득 찼다(잔여석 0)
When 회원이 대기 신청을 한다
Then waitlists 레코드가 status="waiting", position(순번) 과 함께 생성된다
And  reservations.reservation_status 는 "waitlisted"(대기) 로 표현될 수 있다
```

```gherkin
Given waitlist_auto_promote=true 이고 결원이 발생했다
When 시스템이 1순위 대기자를 자동 전환한다
Then 해당 waitlists.status="promoted", 예약이 "booked" 로 승격된다
And  MVP 에서는 대기 확정을 회원 모바일웹의 "내 예약" 화면 상태 변경 + 인앱 표시로 알린다
And  SMS/카카오 발송은 MVP 제외(§6.1)다
```

---

### 모듈 E. 예약/출석 관리 — 관리자 (원본 §58~61)

#### US-E1 — 관리자 대리 예약/취소/변경

- **As a** `info_staff`
- **I want** 전화·방문 회원을 대신해 예약·취소·변경을 처리하고 싶다
- **so that** 모바일웹을 못 쓰는 회원도 동일하게 응대할 수 있다
- **클라이언트**: A · **근거**: 원본 §59 / CANON `reservations`(is_self_booked)

**수용기준**

```gherkin
Given 관리자가 회원 대신 예약을 만든다
When 회원·회차·pass_id 를 골라 예약한다
Then reservations 가 is_self_booked=false 로 생성된다(대리 예약 표시)
And  생성·취소·변경 모두 audit_logs 에 actor=관리자 user 로 기록된다   # CANON §5, 원본 §170
```

#### US-E2 — 정원 초과 차단

- **As a** `manager`
- **I want** 정원을 넘는 예약을 막고 대기로 유도하고 싶다
- **so that** 공간·강사 정원을 넘는 오버부킹을 방지한다
- **클라이언트**: A/M · **근거**: 원본 §55 / CANON `class_sessions.capacity`·`waitlist_capacity`

**수용기준**

```gherkin
Given 정원 capacity=6 인 회차에 booked 예약이 6건이다
When 7번째 예약을 시도한다
Then 정원초과로 "booked" 생성이 거부되고, waitlist_capacity 범위면 대기(waitlisted) 로 안내된다
```

#### US-E3 — 출석/결석/노쇼 처리와 횟수 차감

- **As a** `info_staff`
- **I want** 수업 회차의 참석자를 출석/지각/결석/노쇼로 처리하고 싶다
- **so that** 횟수 차감과 노쇼 관리를 정확히 할 수 있다
- **클라이언트**: A · **근거**: 원본 §60, §17 / CANON `attendance` §2-C16, `attendance_status` §3.6, 정책 `deduct_timing`·`no_show_deduct` §6.1

**수용기준**

```gherkin
Given deduct_timing="on_attend" 인 회차의 출석부를 연다
When 회원을 attendance_status="attended"(출석) 로 처리한다
Then attendance 1건(reservation 1:1)이 생성되고 deducted=true 다
And  pass_transactions(reason="deduct_attend", delta=-1, balance_after=차감후잔여) 가 1건 생성된다
And  passes.remaining_count 가 1 감소한다
```

```gherkin
Given no_show_deduct=true 인 정책이다
When 회원을 attendance_status="no_show"(노쇼) 로 처리한다
Then 횟수가 차감된다(deducted=true, pass_transactions delta=-1)
And  reservation_status 도 "no_show" 로 동기화된다
```

```gherkin
Given 출석 처리를 잘못해 수정한다
When attended → no_show 로 정정한다
Then attendance·pass_transactions 변경이 모두 audit_logs 에 기록된다   # 원본 §135
And  잔여횟수가 산식대로 재계산된다(중복 차감/누락 없음)
```

> **차감 산식(소진기준 단가와 연결, CANON §4.2)**: 출석 시 `passes.remaining_count -= 1`, 동시에 소진기준 매출 `revenue_records(revenue_basis="consumption", amount = passes.unit_price_amount)` 1건 인식. `unit_price_amount = round(purchases.final_amount ÷ passes.total_count)`.

---

### 모듈 F. 수강권/상품 — 횟수권 중심 (원본 §63~66, §39)

#### US-F1 — 횟수권 상품 정의

- **As a** `owner`
- **I want** 1:1권/그룹권/체험권/패키지권을 총횟수·유효기간·가격으로 정의하고 싶다
- **so that** 판매할 수강권 상품을 표준화할 수 있다
- **클라이언트**: A · **근거**: 원본 §63~64 / CANON `products` §2-D17, `pass_kind` §3.7

**수용기준**

```gherkin
Given "상품 등록" 화면을 연다
When name="그룹 20회", pass_kind="group", total_count=20, valid_days=120,
     price_amount=600000, allowed_class_types=["group"] 로 저장한다
Then products 1건이 생성된다
And  pass_kind 는 CANON §3.7 의 4종(personal/group/trial/package) 만 가능하다
And  price_amount 는 정수(원) 로 저장된다(소수점 금지)   # CANON §1.3
```

#### US-F2 — 수강권 발급(구매 연동)

- **As a** `manager`
- **I want** 회원에게 상품을 판매하면 수강권 인스턴스가 발급되도록 하고 싶다
- **so that** 결제와 수강권·잔여횟수가 한 번에 연결된다
- **클라이언트**: A · **근거**: 원본 §65 / CANON `purchases` §2-E20, `passes` §2-D18

**수용기준**

```gherkin
Given 회원에게 "그룹 20회" 를 판매한다
When 구매를 등록한다(list_amount=600000, discount_amount=0, final_amount=600000)
Then purchases 1건과 passes 1건이 함께 생성된다
And  passes.total_count=20, remaining_count=20, start_date, expire_date=start_date+valid_days 가 채워진다
And  passes.unit_price_amount = round(600000 ÷ 20) = 30000 으로 고정된다   # CANON §4.2 소진기준 단가
```

#### US-F3 — 홀딩(정지) / 만료 연장

- **As a** `manager`
- **I want** 회원 수강권을 일시정지하거나 만료일을 연장하고 싶다
- **so that** 부상·출장 등으로 못 오는 회원을 배려할 수 있다
- **클라이언트**: A · **근거**: 원본 §65 / CANON `pass_status` §3.8, 정책 `holdable`·`max_hold_days`·`extend_allowed` §6.2

**수용기준**

```gherkin
Given holdable=true, max_hold_days=30 인 정책이다
When 수강권을 정지한다
Then pass_status="paused"(정지), paused_at 이 기록되고, 누적 paused_days_used 가 30일을 넘지 못한다
And  정지 해제 시 사용한 일수만큼 expire_date 가 연장될 수 있다(정책은 15-pass-policy.md 소유)
```

#### US-F4 — 수동 차감/복구 로그

- **As a** `manager`
- **I want** 예외 상황에서 수강권 횟수를 수동으로 차감/복구하고 그 사유를 남기고 싶다
- **so that** 시스템 외 사유(보상/오류)를 추적 가능하게 처리할 수 있다
- **클라이언트**: A · **근거**: 원본 §66 / CANON `pass_transactions` §2-D19, `pass_txn_reason` §3.9

**수용기준**

```gherkin
Given 회원 수강권을 보상 차원에서 +1 복구한다
When reason="manual_restore", memo="기기고장 보상" 으로 처리한다
Then pass_transactions(delta=+1, balance_after) 1건이 append-only 로 남고 passes.remaining_count 가 +1 된다
And  created_by(수동조정 주체) 가 기록되고 audit_logs(action="pass_adjust") 가 남는다   # 원본 §135
And  reason 은 CANON §3.9 의 6종만 가능
       (deduct_booking/deduct_attend/restore_cancel/restore_close/manual_deduct/manual_restore)
```

---

### 모듈 G. 결제/미수금 — 수동 기록 (원본 §68~73, §27)

#### US-G1 — 현장 카드 / 계좌이체 / 현금 수동 결제 기록

- **As a** `manager`
- **I want** 현장 카드결제·계좌이체·무통장입금·현금 결제를 수단·금액·승인번호·입금자명과 함께 기록하고 싶다
- **so that** 결제 수단을 가리지 않고 매출을 빠짐없이 남길 수 있다
- **클라이언트**: A · **근거**: 원본 §69~71 / CANON `payments` §2-E21, `payment_method` §3.11, `payment_status` §3.10

**수용기준**

```gherkin
Given 구매에 대한 결제를 기록한다
When payment_method="card_onsite", amount=600000, paid_amount=600000,
     card_approval_no="12345678", paid_at 을 입력한다
Then payments 1건이 payment_status="paid"(결제완료) 로 생성된다
And  payment_method 는 CANON §3.11 의 4종만 가능(card_onsite/transfer/cash/online)
And  online 은 PG 연동 전이므로 MVP 화면에서는 선택지로 노출하지 않는다(필드는 존재)   # 원본 §42, §6.3
```

```gherkin
Given 계좌이체 입금을 기다린다
When payment_method="transfer", payment_status="awaiting_deposit"(입금대기), depositor_name="김민지" 로 저장한다
Then 입금 확인 후 payment_status 를 "paid" 로 바꾸면 매출 인식 시점이 확정된다   # CANON §6.3 revenue_recognition
```

#### US-G2 — 미수금 관리

- **As a** `accountant`
- **I want** 결제액 대비 실수령액 차이를 미수금으로 잡고 추적하고 싶다
- **so that** 받지 못한 금액을 한눈에 관리할 수 있다
- **클라이언트**: A · **근거**: 원본 §72(미수금 관리) / CANON `payments.receivable_amount`, `payment_status` §3.10

**수용기준**

```gherkin
Given allow_receivable=true 인 정책이다
When amount=600000, paid_amount=400000 로 결제를 기록한다
Then receivable_amount = amount − paid_amount = 200000 으로 계산된다
And  payment_status 가 "partial"(일부입금) 로 설정된다(미수 전액이면 "receivable")
And  미수금 합계 = Σ payments.receivable_amount where payment_status in (receivable, partial)   # CANON §4.4
```

> **미수금 산식(원장 이해용)**: "받기로 한 돈(amount) − 실제 들어온 돈(paid_amount) = 아직 못 받은 돈(receivable_amount)." 대시보드의 미수금 카드는 이 값들의 합이다.

#### US-G3 — 환불 기록과 잔여횟수 회수

- **As a** `manager`
- **I want** 부분/전액 환불을 사유와 함께 기록하고 남은 횟수를 회수하고 싶다
- **so that** 환불 시 매출·수강권이 정확히 정리된다
- **클라이언트**: A · **근거**: 원본 §66, §72 / CANON `refunds` §2-E22, 정책 `refund_penalty_rate`·`refund_unit_basis` §6.3

**수용기준**

```gherkin
Given 20회권 중 5회 사용 후 전액 환불을 요청한다
When refund_reason 을 입력하고 환불을 처리한다
Then refunds 1건(refund_amount, restored_count, status) 이 생성된다
And  passes.pass_status="refunded" 로 바뀌고 잔여횟수가 회수된다
And  결제기준 매출에는 revenue_records(revenue_basis="payment", source_type="refund", amount=−refund_amount) 가 추가된다   # CANON §4.1
And  소진기준 매출은 미소진분이 애초 인식되지 않아 자동으로 빠진다   # CANON §4.2
And  환불 처리는 audit_logs(action="refund") 에 기록된다   # 원본 §135
```

> **환불액 예시 산식(CANON §6.3)**: 정가 600,000원 / 20회 → 회당 30,000원. 5회 사용, 위약공제율 10% 가정 시
> 사용분 공제 = 5 × 30,000 = 150,000원, 위약금 = 600,000 × 0.10 = 60,000원,
> **환불액 = 600,000 − 150,000 − 60,000 = 390,000원**. (상세 분기는 16-payment-refund-policy.md 소유)

---

### 모듈 H. 비용 — 수동 입력 + CSV (원본 §82~88, §102~104)

#### US-H1 — 비용 수동 입력 (17 카테고리, 고정/변동)

- **As a** `accountant`
- **I want** 비용을 카테고리·고정비/변동비·거래처·금액·증빙과 함께 직접 입력하고 싶다
- **so that** 통장/카드에 안 잡히는 지출도 손익에 반영할 수 있다
- **클라이언트**: A · **근거**: 원본 §82, §87~88 / CANON `expense_records` §2-F24, `expense_category` §3.13, `cost_type` §3.14

**수용기준**

```gherkin
Given "비용 입력" 화면을 연다
When expense_category="rent", amount=2000000, vendor_name="OO빌딩", expense_date, source="manual" 로 저장한다
Then expense_records 1건이 생성되고 cost_type 은 카테고리 기본값(rent→fixed) 로 자동 채워진다
And  expense_category 는 CANON §3.13 의 17종만 가능
       (rent/maintenance_fee/payroll/instructor_fee/advertising/payment_fee/supplies/facility/
        utilities/telecom/tax_accounting/education/insurance/tax/meal/transport/etc)
And  amount 는 정수(원) 다   # CANON §1.3
```

#### US-H2 — 통장 거래내역 CSV 업로드

- **As a** `accountant`
- **I want** 사업자 통장 입출금 CSV를 업로드해 거래내역을 들여오고 싶다
- **so that** 출금을 비용으로, 입금을 매출 후보로 빠르게 정리할 수 있다
- **클라이언트**: A · **근거**: 원본 §83, §102 / CANON `bank_transactions` §2-G28, `bank_accounts` §2-G27

**수용기준**

```gherkin
Given 통장 CSV(거래일/금액/입출금/상대방명/거래후잔액) 를 업로드한다
When 업로드를 실행한다
Then bank_transactions N건이 import_batch_id 와 함께 생성되고 direction(deposit/withdraw) 이 채워진다
And  amount 는 입금 +, 출금 − 부호로 저장된다   # CANON §2-G28
And  MVP 에서는 오픈뱅킹 자동 연동이 아니라 CSV 업로드만 지원한다   # 원본 §105 2차
```

#### US-H3 — 카드 사용내역 CSV 업로드

- **As a** `accountant`
- **I want** 사업자 카드 사용내역 CSV를 올려 지출 후보로 관리하고 싶다
- **so that** 카드로 쓴 비용을 손익에 반영할 수 있다
- **클라이언트**: A · **근거**: 원본 §83, §102 / CANON `card_expenses` §2-G30

**수용기준**

```gherkin
Given 카드 사용내역 CSV(카드번호/가맹점/금액/사용일/청구일) 를 업로드한다
When 업로드를 실행한다
Then card_expenses N건이 생성된다(card_no_masked, vendor_name, amount, used_at)
And  MVP 에서는 카드사 자동조회가 아닌 CSV 업로드만 지원한다   # 원본 §106 2차
```

#### US-H4 — 미매칭/미분류 거래 수동 분류

- **As a** `accountant`
- **I want** 업로드한 통장·카드 거래를 매출/비용/이체/기타로 직접 분류하고 싶다
- **so that** 자동분류가 없어도 손익에 정확히 반영할 수 있다
- **클라이언트**: A · **근거**: 원본 §104 / CANON `match_target` §3.19, `expense_category` §3.13

**수용기준**

```gherkin
Given 미분류 통장 출금 1건을 본다
When match_target="expense" 로 정하고 expense_category="utilities" 를 지정한다
Then expense_records 1건이 source="bank", bank_transaction_id 연결로 생성된다
And  bank_transactions.is_matched=true, match_target="expense" 로 갱신된다
And  match_target 은 CANON §3.19 의 4종만 가능(revenue/expense/transfer/etc)
And  MVP 는 수동 분류만. 거래처명 자동 분류 규칙(transaction_matching_rules) 적용은 2차다   # 원본 §84, §156
```

> **MVP 경계(중요)**: 입금자명↔회원명 **자동 추천 매칭**과 **거래처명 자동 카테고리 매핑·규칙 학습**은 원본 §103~104, §156에 따라 **2차**다. MVP는 업로드 + 사람이 직접 분류까지다.

---

### 모듈 I. 매출 인식 — 이중 손익 (원본 §75~79, §97~99)

#### US-I1 — 결제기준 매출 인식

- **As a** `accountant`
- **I want** 결제가 확정되면 결제기준 매출이 자동 인식되길 원한다
- **so that** 현금흐름 관점의 매출을 즉시 집계할 수 있다
- **클라이언트**: A · **근거**: 원본 §76, §98 / CANON `revenue_records` §2-E23, §4.1

**수용기준**

```gherkin
Given revenue_recognition="on_paid" 인 정책이다
When payment_status 가 "paid" 로 확정된다
Then revenue_records(revenue_basis="payment", source_type="payment", amount=paid_amount, recognized_at=paid_at) 1건이 생성된다
And  환불 시 revenue_basis="payment", source_type="refund", amount=−refund_amount 가 추가되어 순매출이 자동 차감된다
```

#### US-I2 — 소진기준 매출 인식

- **As a** `accountant`
- **I want** 수업이 소진(차감)될 때마다 단가만큼 소진기준 매출이 인식되길 원한다
- **so that** 수업 원가·수익성 관점의 매출을 집계할 수 있다
- **클라이언트**: A · **근거**: 원본 §76, §99 / CANON §4.2

**수용기준**

```gherkin
Given 출석으로 pass_transactions(reason="deduct_attend", delta=−1) 가 발생한다
When 차감이 커밋된다
Then revenue_records(revenue_basis="consumption", source_type="consumption",
     amount=passes.unit_price_amount, class_type, instructor_staff_id) 1건이 생성된다
And  recognized_at = pass_transaction.created_at 이다
And  한 결제는 결제기준 1건 + 소진기준 N건을 만들며, 합산은 기준별로만 한다(중복 합산 금지)   # CANON §4
```

> **이중 인식 한 줄 비교(원장 이해용, CANON §4.3)**: "결제기준 = 돈 받은 날 한 번에 매출. 소진기준 = 수업 한 번 할 때마다 조금씩 매출." 같은 결제를 두 번 더하지 않도록 **대시보드에서 기준을 토글**해서 본다.

---

### 모듈 J. 대시보드 — 매출/비용/기본 손익 (원본 §125~129, §90~93)

#### US-J1 — 이번 달 매출 대시보드(기준 토글)

- **As a** `owner`
- **I want** 이번 달 총매출/환불/순매출을 결제기준·소진기준으로 토글해 보고 싶다
- **so that** 자금 관점과 원가 관점을 함께 판단할 수 있다
- **클라이언트**: A · **근거**: 원본 §91, §97, §127 / CANON `revenue_records`, §4.4

**수용기준**

```gherkin
Given 관리자 웹 대시보드 "이번 달 매출" 영역을 연다
When revenue_basis 토글을 "payment"(결제기준) 와 "consumption"(소진기준) 으로 전환한다
Then 순매출 = Σ revenue_records.amount(선택 basis, 환불 음수 포함) 로 각각 계산되어 표시된다
And  토글 전환으로 같은 결제가 양쪽에 중복 합산되지 않는다(기준별 분리 집계)
And  10초 안에 한 화면에서 총매출·환불·순매출이 보인다   # 원본 §162
```

#### US-J2 — 이번 달 비용 대시보드

- **As a** `accountant`
- **I want** 총비용/고정비/변동비와 주요 카테고리(광고비·강사료·임대료 등) 합을 보고 싶다
- **so that** 어디에 돈이 나가는지 한눈에 파악할 수 있다
- **클라이언트**: A · **근거**: 원본 §92, §128 / CANON `expense_records`, `cost_type` §3.14

**수용기준**

```gherkin
Given "이번 달 비용" 영역을 연다
When 기간을 이번 달로 둔다
Then 총비용 = Σ expense_records.amount, 고정비/변동비 = cost_type 별 합 으로 표시된다
And  카테고리별(광고비/강사료/임대료/소모품비/공과금/기타…) 소계가 함께 보인다
```

#### US-J3 — 기본 손익(영업이익·영업이익률)

- **As a** `owner`
- **I want** 이번 달 영업이익과 영업이익률을 보고 싶다
- **so that** 회계 지식 없이도 이번 달 장사가 됐는지 알 수 있다
- **클라이언트**: A · **근거**: 원본 §93, §129, §165 / CANON §4.4

**수용기준**

```gherkin
Given "이번 달 수익" 영역을 연다
When 대시보드를 본다
Then 영업이익 = 순매출 − 총비용, 영업이익률 = 영업이익 ÷ 순매출 로 표시된다
And  통장 잔액(bank_accounts.balance_amount 합), 미입금 카드매출(Σ card_sales.net_deposit_amount where reconciliation_stage != deposited),
     미수금(Σ payments.receivable_amount) 카드가 함께 보인다   # CANON §4.4
And  월말 예상 매출/이익/현금잔고는 MVP 제외(2차)다   # 원본 §157
```

> **영업이익 예시**: 순매출 12,000,000원 − 총비용 8,400,000원 = **영업이익 3,600,000원**, 영업이익률 3,600,000 ÷ 12,000,000 = **30.0%**.

---

### 모듈 K. 권한 / 감사 로그 (원본 §131~135, §170)

#### US-K1 — 역할별 권한 분리

- **As a** `owner`
- **I want** 강사·회계·인포·회원이 각자 권한 범위만 보게 하고 싶다
- **so that** 개인·결제·수익 정보를 역할별로 안전하게 분리할 수 있다
- **클라이언트**: A/M · **근거**: 원본 §131~134 / CANON §5 RBAC, `role` §3.18

**수용기준**

```gherkin
Given instructor(강사) 로 로그인했다
When 매출·통장 잔액 화면 접근을 시도한다
Then 전체 매출과 통장 잔액 접근이 거부된다(CANON §5: instructor=통장 잔액 불가, 매출은 assigned 한정)
And  강사는 담당 수업·담당 회원 코멘트만 조회 가능하다
```

```gherkin
Given member(회원) 로 모바일웹에 로그인했다
When 데이터를 조회한다
Then 본인 예약·수강권·출석만 보이고 타 회원 데이터는 0건이다   # 원본 §134
```

```gherkin
Given accountant(회계 담당자) 로 로그인했다
When 매출/비용/수익분석에 접근한다
Then 조회·관리가 허용되나 회원 개인 상담메모 등 비범위 데이터는 제한된다   # CANON §5
```

#### US-K2 — 수정/삭제/환불/차감 감사 로그

- **As a** `owner`
- **I want** 모든 금전·민감 데이터 변경이 누가·언제·무엇을 바꿨는지 남길 원한다
- **so that** 분쟁·오류·부정을 추적할 수 있다
- **클라이언트**: A · **근거**: 원본 §135, §170 / CANON `audit_logs` §2-I38

**수용기준**

```gherkin
Given 결제·환불·수강권 차감·회원정보 수정 중 하나가 발생한다
When 변경이 커밋된다
Then audit_logs 에 actor_user_id, actor_role, entity_type, entity_id,
     action(create/update/delete/refund/pass_adjust/match/login/export), before_json, after_json, occurred_at 이 append-only 로 기록된다
And  audit_logs 는 deleted_at 을 쓰지 않으며 물리/논리 삭제가 금지된다   # CANON §2-I38
```

#### US-K3 — 데이터 격리(단일 지점이라도 멀티테넌트 전제)

- **As a** `owner`
- **I want** MVP 단일 지점이라도 모든 데이터가 tenant_id·studio_id로 격리되길 원한다
- **so that** 추후 SaaS 다지점 확장 시 마이그레이션 없이 분리가 유지된다
- **클라이언트**: A/M · **근거**: 원본 §43, §137~138 / CANON §1.2

**수용기준**

```gherkin
Given 어떤 업무 테이블이든 레코드를 생성한다
When 저장한다
Then tenant_id 와 studio_id 가 항상 채워진다(NULL 불가, 글로벌 테이블 제외)
And  모든 조회 쿼리는 tenant_id 필터를 필수로 포함한다   # CANON §1.2
```

---

## 2. MVP 사용자스토리 ↔ 원본 §17 대조표 (커버리지 점검)

> 원본 §152~155의 "MVP 필수" 18개 항목이 빠짐없이 매핑됨을 증명한다.

| # | 원본 §17 MVP 필수 항목 | 커버 US | 핵심 테이블 |
|---|---|---|---|
| 1 | 회원 관리 | US-A1~A4 | `members` |
| 2 | 상담 고객 관리 | US-B1~B3 | `leads`, `counseling_logs` |
| 3 | 1:1/그룹 수업 관리 | US-C1~C3 | `class_templates`, `class_sessions`, `rooms` |
| 4 | 모바일 웹 예약 | US-D1~D2 | `reservations` |
| 5 | 예약/취소/대기 | US-D2, D3, D4, E1, E2 | `reservations`, `waitlists` |
| 6 | 출석/결석/노쇼 | US-E3 | `attendance` |
| 7 | 횟수권/잔여횟수/만료일 | US-F1~F4 | `products`, `passes`, `pass_transactions` |
| 8 | 현장 카드결제/계좌이체 수동 기록 | US-G1 | `purchases`, `payments` |
| 9 | 미수금 관리 | US-G2 | `payments` |
| 10 | (환불 기록 — §66, §72 포함) | US-G3 | `refunds` |
| 11 | 비용 수동 입력 | US-H1 | `expense_records`, `expense_categories` |
| 12 | 통장 CSV 업로드 | US-H2 | `bank_transactions`, `bank_accounts` |
| 13 | 카드 CSV 업로드 | US-H3 | `card_expenses` |
| 14 | (거래 수동 분류 — §104) | US-H4 | `bank_transactions`, `card_expenses` |
| 15 | 기본 매출 대시보드 | US-I1, US-J1 | `revenue_records` |
| 16 | 기본 비용 대시보드 | US-J2 | `expense_records` |
| 17 | 기본 손익분석(이중 기준) | US-I1, I2, US-J3 | `revenue_records`, `expense_records` |
| 18 | 역할별 권한 + 수정/삭제 로그 | US-K1~K3 | `users`, `roles`, `permissions`, `audit_logs` |

→ **18개 MVP 필수 항목 전부 커버.**

---

## 3. MVP에서 제외하는 것 (Out of Scope) + 제외 이유

> 원본 §156~159(2차/3차) 및 §181~190(주의사항)에 근거. "스키마는 있으나 기능은 미구현"과 "아예 미설계"를 구분한다.

### 3.1 2차로 미루는 기능 (원본 §156~157)

| 제외 기능 | 제외 이유 | 근거 | MVP 상태 |
|---|---|---|---|
| 거래내역 **자동분류** / 입금 자동 매칭 | 사람이 분류 규칙을 충분히 검증한 뒤 자동화해야 오분류 리스크가 작다. MVP는 수동 분류로 데이터·규칙을 먼저 쌓는다. | §84, §156 | 스키마(`transaction_matching_rules`) 존재, 기능 미구현 |
| 카드매출 **입금 대조**(승인/매입/입금 3단계 매칭) | 카드사 매출 데이터 연동 전이라 매칭 대상 데이터가 없음. `card_sales`는 2차 입력. | §79, §105, §156 | `card_sales`·`reconciliation_stage` 스키마만 |
| **반복 비용** 자동 등록 | 수동 입력으로 패턴을 먼저 확인 후 자동화. | §156 | `expense_records.is_recurring` 필드만 |
| **월말 예상** 손익/현금잔고 | 결제·소진 데이터가 1~2개월 쌓여야 추정 정확도 확보. | §93, §157 | 미구현 |
| 강사별/수업별/유입경로별 **수익성** 분해 | 소진기준 데이터 누적과 강사료 정산 로직 선행 필요. MVP는 전체 손익만. | §94, §157 | `revenue_records`에 분해용 컬럼은 적재 |
| **재등록 자동화** | 캠페인 로직·알림 발송 인프라(2차) 선행 필요. | §157 | 미구현 |
| **알림톡/SMS/푸시 발송** | 외부 발송사 연동·과금 필요. MVP는 알림을 **인앱 표시·리스트**로만 노출. | §116~119, §157 | `notifications`·`notification_templates` 스키마만, 실발송 없음 |
| **운동일지 / 강사 코멘트** | 강사 운영 정착 후 도입. (강사 코멘트 조회 화면 골격만 둠) | §123, §157 | `exercise_logs` 미구현, `instructor_comments` 조회만 |

### 3.2 3차로 미루는 기능 (원본 §158~159)

| 제외 기능 | 제외 이유 | 근거 |
|---|---|---|
| **오픈뱅킹** 자동 동기화 | 금융결제원 심사·보안 인증 장기 과제. MVP는 CSV로 대체. | §107, §158, §43 |
| **카드매출 통합조회** | 카드사/VAN 연동 필요. | §107, §158 |
| **온라인 결제 / PG** | 결제대행 계약·정산 필요. 필드(`payment_provider`, `external_payment_id`)만 선반영. | §42, §73, §158 |
| **전자계약 / 네이버 예약·플레이스** | 외부 플랫폼 연동·법적 검토. | §158 |
| **다지점 관리 / SaaS 요금제 / 외부 샵 온보딩** | MVP는 내부 단일 지점. 단 데이터는 멀티테넌트로 격리(US-K3). | §137~140, §158, §43 |
| **세무 리포트 내보내기 / 홈택스** | 마감·손익 데이터 안정화 후. | §108, §159 |
| **SaaS 최고관리자(`saas_admin`) 운영 화면** | 외부 샵 온보딩 전에는 불필요. 역할·테이블은 존재. | §34, §137~140 |

### 3.3 아예 안 하는 것(초기 버전 전반, 원본 §186)

| 제외 | 이유 |
|---|---|
| 네이티브 **앱**(iOS/Android) | 회원은 모바일웹으로 시작(원본 §41). |
| **출입제어 / 키오스크** | 하드웨어 연동은 범위 밖(원본 §186). |
| 벤치마크 UI/문구 **복제** | 차별화는 수익분석·경영관리. 복제 금지(원본 §14, §183). |

---

## 4. MVP 클라이언트별 화면 경계 (요약)

> 상세 IA·와이어프레임은 [`07-ia.md`](./07-ia.md)·[`08-wireframes.md`](./08-wireframes.md)가 소유. 여기서는 MVP가 만들 **두 클라이언트의 최소 화면 목록**만 확정.

### 4.1 회원 모바일웹 (M) — 회원(`member`) 전용

| 화면 | 관련 US | 핵심 동작 |
|---|---|---|
| 로그인 / 내 정보 | US-D1, K1 | 본인 인증, 본인 데이터만 |
| 내 수강권 | US-D1 | 잔여횟수·만료일 |
| 수업 예약(목록→회차→확정) | US-D2 | 30초 예약 |
| 내 예약 / 취소 / 대기 | US-D3, D4 | 취소·대기·대기확정 인앱 표시 |
| 내 출석 이력 | US-A3, E3 | 본인 출석/노쇼 조회 |

### 4.2 관리자 웹 (A) — `owner`/`manager`/`info_staff`/`accountant`/`instructor`

| 화면 | 관련 US | 주 사용 역할 |
|---|---|---|
| 대시보드(오늘 운영 + 이번 달 매출/비용/수익) | US-J1~J3 | owner, accountant |
| 회원 목록 / 상세 / 등록 | US-A1~A4 | manager, info_staff |
| 상담 CRM(리드·상담기록·전환율) | US-B1~B3 | info_staff |
| 수업 만들기 / 회차 관리 / 출석부 | US-C1~C3, E3 | manager, info_staff |
| 예약 관리(대리 예약·취소·대기) | US-E1, E2 | info_staff |
| 상품 / 수강권 / 차감 로그 | US-F1~F4 | manager, owner |
| 결제 / 미수금 / 환불 | US-G1~G3 | manager, accountant |
| 비용 입력 / CSV 업로드 / 거래 분류 | US-H1~H4 | accountant |
| 권한·역할 관리 / 감사 로그 조회 | US-K1, K2 | owner |
| 강사 화면(담당 수업·회원 코멘트 조회) | US-K1 | instructor(제한) |

---

## 5. MVP 완료 정의(Definition of Done) — 횡단 기준

아래는 위 모든 US에 공통 적용되는 MVP 합격선이다.

1. **데이터 격리**: 모든 업무 테이블 레코드에 `tenant_id`·`studio_id`가 채워지고, 모든 조회가 `tenant_id`로 필터된다. (US-K3)
2. **금액 정합**: 모든 금액은 정수(원)로 저장. 미수금·환불·순매출·영업이익은 §4.4 산식과 1원 오차 없이 일치. (CANON §1.3, §4.4)
3. **이중 손익**: 동일 결제가 결제기준·소진기준에 각각 인식되며, 기준 토글 시 중복 합산이 발생하지 않는다. (US-I1, I2, J1)
4. **감사 로그**: 모든 수정/삭제/환불/수강권 차감/매칭이 `audit_logs`에 예외 없이 남는다. (US-K2)
5. **권한**: 강사는 전체 매출·통장 잔액 접근 불가, 회원은 본인 데이터만. (US-K1)
6. **UX 시간**: 원장 대시보드 10초, 회원 예약 30초, 관리자 핵심 입력 3클릭 충족. (US-A1, D2, J1)
7. **enum/네이밍 일치**: 모든 저장값·컬럼명·테이블명이 CANON과 글자 단위로 일치. (CANON 전체)

---

## 관련 문서

- [`00-canon.md`](./00-canon.md) — 단일 진실원천(스키마·enum·RBAC·회계모델·정책 기본값). 본 문서의 모든 코드/산식 근거.
- [`_source-requirements.md`](./_source-requirements.md) — 정본 소스(§17 MVP 우선순위).
- [`04-feature-catalog.md`](./04-feature-catalog.md) — 전체 기능 목록(MVP/2차/3차 표시의 상위 집합).
- [`06-scope-phases.md`](./06-scope-phases.md) — 본 문서가 제외한 2차/3차 확장 범위 상세.
- [`07-ia.md`](./07-ia.md) — 화면 IA(클라이언트별 화면 구조).
- [`08-wireframes.md`](./08-wireframes.md) — 주요 화면 와이어프레임.
- [`09-admin-dashboard.md`](./09-admin-dashboard.md) — 관리자 대시보드 4영역 설계(US-J1~J3 상세).
- [`10-profit-dashboard.md`](./10-profit-dashboard.md) — 수익분석 대시보드·`revenue_basis` 토글(US-I1/I2 상세).
- [`13-rbac.md`](./13-rbac.md) — 권한 정책 상세(US-K1).
- [`14-booking-policy.md`](./14-booking-policy.md) — 예약/취소/노쇼/차감 정책(US-D2~D4, E3 상세).
- [`15-pass-policy.md`](./15-pass-policy.md) — 수강권 정책(US-F1~F4 상세).
- [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) — 결제/환불 정책(US-G1~G3 상세).
- [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) — 통장/카드 거래 매칭 정책(US-H2~H4 상세, 자동화는 2차).
- [`18-expense-category-policy.md`](./18-expense-category-policy.md) — 비용 카테고리 정책(US-H1 상세).
- [`19-metrics.md`](./19-metrics.md) — 수익분석 지표 산식(US-I/J 산식 소유).
- [`21-roadmap.md`](./21-roadmap.md) — 개발 우선순위(MVP→2차→3차 일정).
- [`22-qa-checklist.md`](./22-qa-checklist.md) — QA 체크리스트(본 §5 DoD 검증 항목).
