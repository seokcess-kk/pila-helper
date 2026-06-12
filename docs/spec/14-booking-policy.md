# 14-booking-policy.md — 예약/취소/노쇼/차감 정책

> **목적**: 회원의 수업 예약·취소·노쇼·대기·출석 처리와 그에 따른 **수강권 차감/복구**가 언제·어떤 조건으로 일어나는지, 그리고 자동 폐강·대기자 자동전환·강사 대체 배정 규칙을 한 곳에서 완결적으로 정의한다. 모든 정책 값은 [`00-canon.md`](./00-canon.md) §6.1을 기본값으로 하며 **스튜디오별 설정값**(`studios.policy_json`)으로 오버라이드된다.

본 문서는 [`00-canon.md`](./00-canon.md)의 계약을 따른다. 테이블명·컬럼명·enum 값은 모두 canon §2(엔티티 사전)·§3(enum 사전)·§6(정책 파라미터)에서 정의된 것을 **글자 단위로** 사용한다. 본 문서는 정책의 **적용 규칙**을 소유하되, enum·테이블·정책 기본값의 정의는 바꿀 수 없다.

---

## 1. 범위와 핵심 원칙

### 1.1 이 문서가 다루는 것

- 예약 가능 시점(오픈)·예약 마감·취소 마감 시간 규칙
- 회원 1인 1일 예약 한도
- 당일취소(마감 후 취소) 규칙과 노쇼 처리
- **수강권 차감 시점 정책**: 예약 시(`on_booking`) vs 출석 시(`on_attend`)
- 예약 라이프사이클 상태별 **차감/복구 매트릭스**(예약·대기·출석·결석·노쇼·취소-정상·취소-마감후·폐강)
- 대기자 자동전환 로직과 알림
- 강사 대체 배정
- 자동 폐강(최소정원 미달) 조건
- 1:1 개인레슨(`personal`)과 그룹레슨(`group`)의 차이 반영

### 1.2 관계되는 핵심 엔티티 (canon §2)

| 엔티티 | 본 정책에서의 역할 |
|---|---|
| `class_sessions` | 예약·출석의 기준이 되는 개별 수업 회차. `capacity`·`waitlist_capacity`·◆`session_status` 보유 |
| `class_templates` | 정규/반복 수업 설계. 예약/취소/차감 정책을 회차보다 우선 오버라이드(§2.3) |
| `reservations` | 회원의 회차 예약 1건. ◆`reservation_status`·`pass_transaction_id`(차감 연결) 보유 |
| `waitlists` | 정원 초과 대기 큐. `position`·◆`status`(waiting/promoted/canceled/expired) 보유 |
| `attendance` | 출석 처리 결과. ◆`attendance_status`·`deducted`(차감 여부) 보유 |
| `passes` | 회원 보유 수강권 인스턴스. `remaining_count`·◆`pass_status` 보유 |
| `pass_transactions` | 수강권 증감 원장(append-only). ◆`reason`(`pass_txn_reason`)·`delta`·`balance_after` 보유 |
| `notifications` | 예약/취소/대기 알림 발송 이력 |
| `audit_logs` | **모든 차감/복구·수동 조정 기록**(canon §1.2, §5 필수) |

### 1.3 불변 원칙 (Invariants)

1. **수강권 잔여는 `pass_transactions` 원장의 누적으로만 변한다.** `passes.remaining_count`는 항상 마지막 `pass_transactions.balance_after`와 일치해야 한다. 직접 수정 금지.
2. **모든 차감/복구는 1건의 `pass_transactions` 레코드를 만든다.** 같은 예약에 대해 차감과 복구는 별도 레코드(append-only, 음수/양수 `delta`)로 남기며, 기존 레코드를 수정·삭제하지 않는다.
3. **이중 회계 정합성**(canon §4): 차감(`deduct_*`)이 발생할 때만 소진기준 매출(`revenue_records.revenue_basis='consumption'`)이 인식된다. 따라서 "언제 차감하는가"는 회계상 "언제 매출을 소진 인식하는가"와 동일 사건이다.
4. **정책 판정 타임존**은 스튜디오 타임존(`studios.timezone`, 기본 `Asia/Seoul`)을 사용한다(canon §1.4). 저장은 UTC `timestamptz`(`_at`).
5. **잔여횟수 부족 시 예약 불가**: 유효한 `passes`(◆`pass_status='active'`, `remaining_count >= 1`, 만료 전)가 없으면 예약을 생성하지 않는다. 단, `on_attend` 정책에서는 "예약 시점에 잔여를 홀드(예약점유)"하여 초과예약을 방지한다(§4.3).

---

## 2. 예약 가능 시간 규칙 (오픈·마감·취소마감)

### 2.1 정책 파라미터 (canon §6.1 기본값)

모든 값은 `studios.policy_json` 기본값이며, 수업 단위(`class_templates`)에서 동명 컬럼으로 재오버라이드된다. **저장 위치 우선순위**: `class_templates`(회차 템플릿) > `studios.policy_json`(스튜디오) > 시스템 기본값.

| 정책 | canon 키 | 기본값 | 의미 | 오버라이드 컬럼(class_templates) |
|---|---|---|---|---|
| 예약 오픈일 | `booking_open_days` | 14일 | 수업 시작 **14일 전부터** 예약 가능 | `booking_open_days` |
| 예약 마감(분) | `booking_close_minutes` | 60분 | 수업 시작 **60분 전** 예약 마감 | `booking_close_minutes` |
| 취소 마감(분) | `cancel_deadline_minutes` | 120분 | 시작 **120분 전까지** 무차감 취소 | `cancel_deadline_minutes` |
| 1일 예약 한도 | `daily_booking_limit` | 1회 | 회원 1인 1일 최대 예약 수 | (스튜디오 단위) |
| 차감 시점 | `deduct_timing` | `on_attend` | `on_booking` / `on_attend` | (스튜디오 단위) |
| 노쇼 차감 | `no_show_deduct` | true | 노쇼 시 횟수 차감 | (스튜디오 단위) |
| 지각취소 차감 | `late_cancel_deduct` | true | 취소마감 이후 취소 시 차감 | (스튜디오 단위) |
| 대기 자동전환 | `waitlist_auto_promote` | true | 결원 시 대기 1순위 자동 확정 | (스튜디오 단위) |
| 대기 확정 응답시한(분) | `waitlist_promote_ttl_minutes` | 30분 | 자동전환 후 무응답 시 다음 순번 | (스튜디오 단위) |
| 자동 폐강 최소인원 | `auto_close_min_count` | 1명 | 미만 시 자동 폐강 후보 | (스튜디오 단위) |

### 2.2 시간 윈도우 정의 (산식)

기준 시각은 회차의 `class_sessions.start_at`(스튜디오 타임존 기준). `now`는 현재 시각.

```
예약 오픈 시각  booking_open_at   = start_at − booking_open_days × 24h
예약 마감 시각  booking_close_at  = start_at − booking_close_minutes (분)
취소 마감 시각  cancel_deadline_at = start_at − cancel_deadline_minutes (분)

예약 가능 조건 (모두 충족):
  booking_open_at ≤ now < booking_close_at
  AND class_sessions.session_status ∈ { open }
  AND 잔여석 > 0  (잔여석 = capacity − 확정예약수)
  AND 회원 1일 예약 한도 미초과 (§2.4)
  AND 유효 수강권 보유 (§1.3-5)

무차감 취소 가능 조건:
  now < cancel_deadline_at

지각취소(마감 후 취소):
  cancel_deadline_at ≤ now < start_at  → late_cancel_deduct 정책 적용
```

> **반열림 구간 해석**(canon §1.4): 예약 윈도우는 `[booking_open_at, booking_close_at)`. 마감 시각 정각(`= booking_close_at`)에는 예약 불가.

### 2.3 회차 상태(`session_status`)와 예약 가능성

`class_sessions.session_status`(canon §3.4)는 예약 가능 여부의 1차 게이트다.

| `session_status` | 라벨 | 예약 가능? | 비고 |
|---|---|---|---|
| `scheduled` | 예정 | 불가 | 아직 오픈 전(`now < booking_open_at`) |
| `open` | 예약가능 | 가능 | 윈도우 내 + 잔여석 있음 |
| `closed` | 예약마감 | 불가 | 마감 시각 경과 또는 정원 충족 |
| `canceled` | 폐강 | 불가 | 폐강된 회차(§7). 전원 복구 처리 |
| `completed` | 종료 | 불가 | 수업 종료. 출석 확정 대상 |

**상태 자동 전이**(스케줄러/시스템):

```
scheduled → open      : now ≥ booking_open_at 도달 시
open      → closed     : now ≥ booking_close_at 도달 OR 잔여석 0 (정원 충족)
closed    → open       : (정원 충족으로 닫혔다가) 결원 발생 + now < booking_close_at 일 때 재오픈
open/closed→ canceled  : 자동 폐강(§7) 또는 관리자 수동 폐강
open/closed→ completed : end_at 경과 후 출석 마감 처리 시
```

### 2.4 1일 예약 한도 (`daily_booking_limit`)

- 같은 **스튜디오 타임존 기준 날짜**(`start_at`의 KST date)에 회원이 가질 수 있는 **확정 예약(`reservation_status='booked'`)** 수의 상한.
- 기본값 1회. 한도 산정 시 **대기(`waitlisted`)는 포함하지 않는다.** 대기가 확정으로 전환되는 시점에 한도를 재검사한다(초과 시 전환 보류·다음 순번).
- 취소(`canceled`)·노쇼(`no_show`)는 한도 계산에서 제외(이미 차감/처리됨).
- 산식:

```
오늘예약수(member, date) = COUNT(reservations
    WHERE member_id = ? AND reservation_status = 'booked'
      AND date(start_at @ studio_tz) = date)
예약 허용 ⇔ 오늘예약수 < daily_booking_limit
```

> 1:1(`personal`)은 보통 한도를 별도로 두지 않거나 크게 설정(예: 그룹과 분리 관리). 스튜디오는 필요 시 `daily_booking_limit`를 그룹 기준으로만 운영하고 1:1은 강사 일정으로 통제한다(§8 참조).

---

## 3. 수강권 차감 시점 정책 (핵심)

### 3.1 두 가지 차감 시점

`deduct_timing`(canon §6.1, 기본 `on_attend`)은 횟수권이 **언제 1회 차감되는가**를 결정한다. 이는 canon §4.2(소진기준 매출 인식 시점)와 직결된다.

| 값 | 라벨 | 차감 발생 시점 | 사용 `pass_txn_reason` | 회계 영향 |
|---|---|---|---|---|
| `on_booking` | 예약 시 차감 | `reservations` 생성 시(예약 확정 즉시) | `deduct_booking`(예약차감) | 예약 시점에 소진기준 매출 인식 |
| `on_attend` | 출석 시 차감 | `attendance` 처리 시(출석/노쇼 확정) | `deduct_attend`(출석차감) | 출석 확정 시점에 소진기준 매출 인식 |

> **스튜디오는 둘 중 하나만 사용**한다(canon §3.9 주석). 한 스튜디오 안에서 두 reason이 혼용되지 않는다. 단, 정책 변경 시점 이전 예약은 변경 전 reason을 유지한다.

### 3.2 `on_booking`(예약 시 차감) 상세

- **흐름**: 예약 생성 → 즉시 `pass_transactions(reason='deduct_booking', delta=-1)` → `passes.remaining_count` −1 → 소진기준 매출 1건 인식.
- **장점**: 잔여횟수가 예약 즉시 확정되어 회원·관리자에게 직관적. 노쇼여도 이미 차감되어 별도 노쇼차감 불필요.
- **취소·폐강 시**: 정상취소·폐강은 `restore_*`로 **반드시 복구**(다시 +1). 지각취소(마감 후)는 정책(`late_cancel_deduct`)에 따라 복구하지 않을 수 있음(§5).
- **노쇼 시**: 이미 차감되었으므로 추가 차감 없음. `no_show_deduct=false`라도 예약 시 차감된 건은 **복구하지 않는다**(노쇼는 무차감 사유가 아님). 즉 `on_booking`에서 노쇼는 차감 유지.

### 3.3 `on_attend`(출석 시 차감) 상세 — 기본값

- **흐름**: 예약 생성 시 차감 없음(잔여 점유만, §4.3) → 수업 후 출석 처리 시 `pass_transactions(reason='deduct_attend', delta=-1)` → 차감 → 소진기준 매출 인식.
- **장점**: 실제 사용한 만큼만 매출 인식되어 **수업 원가·강사 수익성 분석에 정확**(canon §4.2). 회원도 실제 참석분만 차감되어 공정.
- **노쇼/지각취소 차감**: 출석하지 않았으므로 기본은 미차감이지만, `no_show_deduct=true`/`late_cancel_deduct=true`면 **출석 대신 노쇼·지각취소 사유로 차감**한다. 이때도 reason은 `deduct_attend`를 사용하되, `attendance.attendance_status`로 사유를 구분(노쇼=`no_show`, 사유결석=`excused`는 면제 가능).
- **결석(`excused`, 사유결석)**: `no_show_deduct`와 무관하게 **차감 면제**가 원칙(`attendance.deducted=false`). 관리자 재량.

### 3.4 잔여 점유(예약 홀드) — `on_attend`에서 초과예약 방지

`on_attend`는 예약 시 실제 차감하지 않으므로, "잔여 2회인데 5개 회차를 예약"하는 초과예약이 생길 수 있다. 이를 막기 위해 **예약 홀드** 개념을 둔다.

```
가용잔여(available) = passes.remaining_count
                    − COUNT(reservations
                        WHERE pass_id = ? AND reservation_status IN ('booked','waitlisted')
                          AND 아직 출석 처리 전(차감 미발생))
예약 허용 ⇔ 가용잔여 ≥ 1
```

- 홀드는 `pass_transactions`를 만들지 않는다(실제 차감 아님). `reservations`의 미처리 건수로 계산한다.
- 출석 처리 시 홀드 1건이 실제 차감(`deduct_attend`)으로 확정된다.
- 정상취소 시 홀드가 자연 해제(예약이 `canceled`가 되어 카운트에서 빠짐).

### 3.5 라운딩·소진기준 단가 (canon §4.2 연계)

- 소진 1회당 인식액 = `passes.unit_price_amount = round(purchases.final_amount / passes.total_count)`(발급 시 고정).
- 차감(`deduct_*`)이 발생할 때 `revenue_records(revenue_basis='consumption', amount=unit_price_amount, class_type=…, instructor_staff_id=…)` 1건 생성. **차감 시점이 곧 소진기준 매출 인식 시점**.

---

## 4. 예약 생성·확정 흐름

### 4.1 회원 직접 예약(모바일 웹) / 관리자 대리 예약

두 경로 모두 `reservations`를 만들며, 구분은 `reservations.is_self_booked`(회원 직접=true / 대리=false)로 기록한다. 정책 판정은 동일하되, 관리자 대리 예약은 일부 게이트(예약 마감·1일 한도)를 **관리자 권한으로 우회**할 수 있다(스튜디오 설정).

### 4.2 예약 생성 알고리즘 (의사코드)

```
function createReservation(member, session, pass):
  # 0. 권한·게이트 검사
  assert session.session_status == 'open'
  assert booking_open_at ≤ now < booking_close_at            # §2.2
  assert dailyBookingCount(member, date) < daily_booking_limit  # §2.4
  assert isValidPass(pass)   # active, 만료 전, (on_attend) 가용잔여≥1 / (on_booking) remaining≥1

  # 1. 잔여석 판정
  confirmed = COUNT(reservations WHERE class_session_id=session AND reservation_status='booked')
  if confirmed < session.capacity:
      status = 'booked'
  else if waitlist 가능(§6) and waitlistCount < session.waitlist_capacity:
      status = 'waitlisted'
  else:
      reject('정원 마감, 대기 불가')

  # 2. 예약 레코드 생성
  reservation = insert reservations(
      class_session_id=session, member_id=member, pass_id=pass,
      reservation_status=status, booked_at=now,
      is_self_booked=(회원직접 ? true : false))

  # 3. 차감 시점 정책 적용 (status='booked'에 한함; 대기는 차감/홀드 없음)
  if status == 'booked' and deduct_timing == 'on_booking':
      tx = insert pass_transactions(
          pass_id=pass, member_id=member, reason='deduct_booking',
          delta=-1, balance_after=pass.remaining_count - 1,
          reservation_id=reservation.id)
      pass.remaining_count -= 1
      reservation.pass_transaction_id = tx.id
      recognizeConsumptionRevenue(tx)        # canon §4.2
      audit_log('pass_adjust', tx)            # canon §5
  # on_attend면 여기서는 차감 없음(홀드만, §3.4)

  # 4. 정원 충족 시 회차 마감
  if confirmedAfter == session.capacity:
      session.session_status = 'closed'

  # 5. 알림
  if status == 'booked':  sendNotification('reservation_done', member)   # canon §3.20
  if status == 'waitlisted': (대기 등록 안내; 확정 아님)

  return reservation
```

### 4.3 1:1(`personal`) vs 그룹(`group`) 예약 차이

| 항목 | 1:1 개인레슨(`personal`) | 그룹레슨(`group`) |
|---|---|---|
| 정원(`capacity`) | 1 | N(룸 `capacity` 이하) |
| 대기(`waitlist`) | 보통 미사용(`waitlist_capacity=0`) — 강사 슬롯 1개라 대기 무의미 | 사용(`waitlist_capacity>0`) |
| 예약 = 강사 슬롯 점유 | 예약 즉시 해당 강사·시간 슬롯 독점 | 정원 내 다수 회원 공유 |
| 자동 폐강(§7) | 해당 없음(1명 예약이 곧 수업 성립) | 적용(최소인원 미달 시 폐강 후보) |
| 1일 한도 | 강사 일정으로 통제, 한도 별도 가능 | `daily_booking_limit` 직접 적용 |
| 사용 수강권 | `pass_kind='personal'`(1:1권) | `pass_kind='group'`(그룹권) |

> 회차의 `class_type`(`personal`/`group`/`trial`)과 수강권 `pass_kind`의 **허용 매칭**은 `products.allowed_class_types`로 검증한다(canon §2-17). 예: 1:1권으로 그룹 회차 예약 불가(스튜디오 정책에 따라 패키지권은 혼용 허용 가능).

---

## 5. 취소·노쇼 처리와 상태별 차감/복구 매트릭스

### 5.1 취소의 두 종류

| 종류 | 조건 | 정책 키 | 기본 동작 |
|---|---|---|---|
| **정상취소** | `now < cancel_deadline_at` | — | 무차감. (`on_booking`이면 복구 +1, `on_attend`이면 홀드 해제) |
| **지각취소(마감 후)** | `cancel_deadline_at ≤ now < start_at` | `late_cancel_deduct` | true면 **차감 유지/차감**, false면 정상취소처럼 무차감 |

`reservations.cancel_reason`에 사유 문자열을 남기고, `canceled_at`을 기록한다. 정상/지각 구분은 `canceled_at`과 `cancel_deadline_at` 비교로 판정(별도 메타).

### 5.2 노쇼·결석·출석 처리

수업 종료(`end_at` 경과) 후 출석 처리 시 `attendance` 레코드를 만들고 `attendance_status`(canon §3.6)를 확정한다.

| `attendance_status` | 라벨 | 차감(`deducted`) 원칙 | 비고 |
|---|---|---|---|
| `attended` | 출석 | 차감 | 정상 소진 |
| `late` | 지각 | 차감 | 출석으로 간주(정상 차감) |
| `absent` | 결석 | 정책에 따름 | 사전 통보 결석. 통상 차감(스튜디오 재량) |
| `no_show` | 노쇼 | `no_show_deduct`에 따름 | 무단 불참. 기본 true=차감 |
| `excused` | 사유결석 | **면제(차감 안 함)** | 차감면제 가능(canon §3.6). `deducted=false` |

### 5.3 상태별 차감/복구 통합 매트릭스 (★핵심)

아래 표는 **각 라이프사이클 사건**에서 `pass_transactions`에 무엇이 기록되고 `passes.remaining_count`가 어떻게 변하는지를 `deduct_timing`별로 정리한다. (Δ는 `remaining_count` 변화량)

| # | 사건 | `reservation_status` / `attendance_status` | `on_booking` 정책 | `on_attend` 정책 |
|---|---|---|---|---|
| 1 | **예약 확정** | `booked` | `deduct_booking` Δ=−1, 매출 소진 인식 | 차감 없음(홀드만 Δ=0) |
| 2 | **대기 등록** | `waitlisted` | 차감 없음 Δ=0 | 차감 없음 Δ=0 |
| 3 | **대기→확정 전환**(§6) | `waitlisted→booked` | `deduct_booking` Δ=−1 | 차감 없음(홀드 전환) |
| 4 | **출석** | `attended`/`late` | 추가 없음(이미 차감됨) Δ=0 | `deduct_attend` Δ=−1, 매출 소진 인식 |
| 5 | **사유결석** | `excused` | `restore_cancel` Δ=+1(차감 면제 환원) | 차감 없음(홀드 해제) Δ=0 |
| 6 | **결석(사전통보)** | `absent` | 추가 없음(차감 유지) Δ=0 | `deduct_attend` Δ=−1 ※스튜디오 재량으로 면제 가능 |
| 7 | **노쇼** (`no_show_deduct=true`) | `no_show` | 추가 없음(차감 유지) Δ=0 | `deduct_attend` Δ=−1(노쇼 사유) |
| 8 | **노쇼** (`no_show_deduct=false`) | `no_show` | `restore_cancel` Δ=+1(복구) | 차감 없음(홀드 해제) Δ=0 |
| 9 | **정상취소** (마감 전) | `canceled` | `restore_cancel` Δ=+1 | 차감 없음(홀드 해제) Δ=0 |
| 10 | **지각취소** (`late_cancel_deduct=true`) | `canceled` | 추가 없음(차감 유지) Δ=0 | `deduct_attend` Δ=−1(지각취소 차감) |
| 11 | **지각취소** (`late_cancel_deduct=false`) | `canceled` | `restore_cancel` Δ=+1 | 차감 없음(홀드 해제) Δ=0 |
| 12 | **폐강**(자동/수동, §7) | 전원 `canceled` | `restore_close` Δ=+1 | 차감 없음(홀드 해제) Δ=0 |
| 13 | **대기 취소/만료** | `waiting→canceled/expired` | 차감 없음 Δ=0 | 차감 없음 Δ=0 |
| 14 | **수동 차감/복구** | (관리자) | `manual_deduct` Δ=−1 / `manual_restore` Δ=+1 | 동일 |

> **읽는 법(원장용)**:
> - `on_booking`은 "예약하면 무조건 1회 빠진다. 취소·폐강·노쇼면제면 다시 채워준다."
> - `on_attend`는 "예약해도 안 빠진다. 실제로 출석(또는 노쇼/지각취소 차감)할 때 1회 빠진다."
> - 두 정책 모두 **최종적으로 회원이 잃는 횟수는 같아야 한다**(예: 노쇼 차감 켜짐이면 노쇼 시 1회 차감). 차이는 "언제 장부에 찍히느냐"일 뿐이며, 이는 소진기준 매출의 인식 시점 차이로 이어진다.

### 5.4 복구 레코드 작성 규칙

- 복구는 항상 **새 `pass_transactions`** 를 만든다(원장 불변, canon §2-19, §1.3 불변원칙2). 예약차감 레코드를 삭제하지 않는다.
- `reason`은 사유에 맞춘다: 취소복구=`restore_cancel`, 폐강복구=`restore_close`, 수동복구=`manual_restore`.
- `balance_after`는 복구 후 잔여, `reservation_id`로 원 예약과 연결.
- **소진기준 매출 환원**: 이미 소진 인식된 건을 복구하면(예: `on_booking`에서 정상취소) canon §4.2에 따라 `revenue_records`에 `source_type='refund'`, `amount` 음수의 소진 조정 레코드를 추가하여 소진매출에서 자동 차감한다.
- 복구 시 `passes.pass_status`가 `used_up`이었다면 `active`로 되돌린다(만료 전 한정). 만료(`expired`)된 권은 복구해도 사용 불가(연장 정책은 [`15-pass-policy.md`](./15-pass-policy.md) 소유).

### 5.5 예시 시나리오 (정합성 검증)

**시나리오 A — `on_attend`, 그룹, 노쇼차감 켜짐**

| 단계 | 사건 | pass_transactions | remaining_count | 비고 |
|---|---|---|---|---|
| 0 | 그룹권 10회 발급 | — | 10 | `unit_price_amount` 고정 |
| 1 | 6/15 회차 예약 | (없음, 홀드) | 10 | 가용잔여 9 |
| 2 | 노쇼 처리 | `deduct_attend` −1 | 9 | 소진매출 1건(`no_show`) |

**시나리오 B — `on_booking`, 그룹, 정상취소**

| 단계 | 사건 | pass_transactions | remaining_count | 비고 |
|---|---|---|---|---|
| 0 | 그룹권 10회 발급 | — | 10 | |
| 1 | 6/15 회차 예약 | `deduct_booking` −1 | 9 | 소진매출 +1건 |
| 2 | 마감 전 취소 | `restore_cancel` +1 | 10 | 소진매출 환원(−1건) |

**시나리오 C — `on_attend`, 그룹, 지각취소 차감 켜짐**

| 단계 | 사건 | pass_transactions | remaining_count | 비고 |
|---|---|---|---|---|
| 1 | 예약 | (홀드) | 10 | |
| 2 | 시작 30분 전 취소(취소마감 120분 경과) | `deduct_attend` −1 | 9 | 지각취소 차감 |

---

## 6. 대기자(waitlist) 자동전환 로직과 알림

### 6.1 대기 등록

- 정원(`capacity`) 충족된 `open`/`closed` 회차에 대해, `waitlist_capacity > 0`이고 현재 대기수 < `waitlist_capacity`면 `reservations.reservation_status='waitlisted'` + `waitlists` 큐에 등록.
- `waitlists.position`은 등록순 정수(1부터). `status='waiting'`, `requested_at=now`.
- 대기는 **차감/홀드를 만들지 않는다**(매트릭스 #2). 단, 유효 수강권 보유는 등록 조건.
- 1:1(`personal`)은 기본적으로 `waitlist_capacity=0`(대기 미사용, §4.3).

### 6.2 결원 발생 → 자동전환 (`waitlist_auto_promote=true`)

결원이 생기는 사건: 확정예약의 정상취소·지각취소·폐강 외 개별 결원, 노쇼면제 등으로 잔여석이 생길 때(단 회차 마감 전, `now < booking_close_at`).

```
function onSeatFreed(session):
  if not waitlist_auto_promote: return
  if now ≥ booking_close_at: return        # 마감 후엔 자동전환 안 함(스튜디오 정책)
  next = waitlists WHERE class_session_id=session AND status='waiting'
         ORDER BY position ASC LIMIT 1
  if next is null: 
      session.session_status = 'open'      # 대기 없으면 재오픈(§2.3)
      return

  # 1일 한도·유효 수강권 재검사
  if dailyBookingCount(next.member, date) ≥ daily_booking_limit
     or not isValidPass(next.pass):
      next.status = 'canceled'             # 전환 불가 → 스킵, 다음 순번 재귀
      onSeatFreed(session)
      return

  # 임시 확정 + 응답시한 부여
  next.status = 'promoted'; next.promoted_at = now
  reservation(next).reservation_status = 'booked'
  applyDeductionOnPromote(next)            # 매트릭스 #3 (on_booking이면 deduct_booking)
  sendNotification('waitlist_promoted', next.member)   # canon §3.20
  scheduleTTLCheck(next, waitlist_promote_ttl_minutes)
```

### 6.3 응답시한(TTL)과 차순위 이전

- 자동전환된 회원에게 `waitlist_promoted`(대기 확정) 알림 발송 후 `waitlist_promote_ttl_minutes`(기본 30분) 내 명시적 확정/유지가 없으면 — 또는 회원이 명시적으로 포기하면 — 해당 전환을 취소하고 **다음 순번**으로 이전한다.
- 무응답 만료 시: 해당 `waitlists.status='expired'`, 연결 예약은 `canceled`로 되돌리고 차감/홀드를 원복(매트릭스 #9 정상취소에 준함), 이어 §6.2를 차순위로 재실행.
- **수업 시작 임박**(`now`가 `start_at`에 근접해 TTL을 다 줄 수 없는 경우): TTL을 `start_at − now`로 단축. `start_at` 도달 시 미응답분은 즉시 만료.

### 6.4 대기 관련 알림 (canon §3.20)

| 사건 | `notification_type` | 수신자 | 시점 |
|---|---|---|---|
| 대기 등록 완료 | (예약 안내 계열) | 회원 | 대기 등록 시(확정 아님 명시) |
| 결원으로 자동 확정 | `waitlist_promoted`(대기 확정) | 전환된 회원 | 자동전환 즉시 |
| 예약 확정(일반) | `reservation_done`(예약 완료) | 회원 | 확정 시 |
| 예약 취소 | `reservation_canceled`(예약 취소) | 회원 | 취소 처리 시 |
| 수업 전 리마인드 | `reservation_reminder`(예약 전 리마인드) | 확정 회원 | `start_at − reminder_before_minutes`(기본 1440분/24h, canon §6.4) |

---

## 7. 자동 폐강 (최소정원 미달)

### 7.1 적용 대상과 조건

- 대상: **그룹(`group`)** 회차. 1:1(`personal`)은 1명 예약이 곧 수업 성립이므로 자동 폐강 대상이 아니다(§4.3). 체험(`trial`) 회차는 스튜디오 정책에 따른다.
- 조건(폐강 후보):

```
폐강 후보 ⇔ confirmedCount(session) < auto_close_min_count   # 기본 1명
            평가 시점: booking_close_at (예약 마감 시각)
confirmedCount = COUNT(reservations WHERE reservation_status='booked')
```

- 기본값 `auto_close_min_count=1`은 "예약 0명이면 폐강 후보". 스튜디오가 그룹 최소 운영 인원을 2~3명으로 두면 그 값으로 평가.

### 7.2 폐강 처리 흐름

```
function autoCloseIfNeeded(session):       # booking_close_at 도달 시 스케줄러 실행
  if session.class_type == 'personal': return
  if confirmedCount(session) ≥ auto_close_min_count: 
      session.session_status = 'closed'    # 정상 마감
      return
  # 폐강 확정
  session.session_status = 'canceled'
  for r in reservations(session) WHERE reservation_status IN ('booked','waitlisted'):
      r.reservation_status = 'canceled'
      r.cancel_reason = 'auto_close_min_count_unmet'
      restoreOnClose(r)                    # 매트릭스 #12: restore_close 또는 홀드 해제
      sendNotification('reservation_canceled', r.member)  # canon §3.20
  audit_log('update', session)             # 폐강 사실 기록
```

- **폐강 복구는 회원 귀책이 아니므로 무조건 전액 복구**(`restore_close`, 매트릭스 #12). 지각취소·노쇼 차감 정책과 무관.
- 폐강된 회차의 강사 슬롯은 해제되어 대체/재배정 가능(§8).
- 자동 폐강 평가 시점은 `booking_close_at` 기본. 스튜디오가 더 일찍 통보를 원하면 별도 선평가 시각(예: `start_at − 24h`)을 운영할 수 있으나, **확정 폐강은 마감 시각 평가**를 기준으로 한다(그 전 결원·추가예약 변동 흡수).

### 7.3 수동 폐강

- 관리자(`owner`/`manager`, canon §5 RBAC)는 강사 사정·시설 문제 등으로 임의 시점에 수동 폐강 가능. 처리 흐름은 §7.2와 동일(전원 복구 + 취소 알림 + `audit_logs`).

---

## 8. 강사 대체 배정 (Substitute)

### 8.1 데이터 표현

- `class_sessions.substitute_staff_id`(canon §2-13, nullable)에 대체 강사를 기록한다. 원 강사는 `instructor_staff_id` 유지(이력 보존).
- 대체 배정은 **회차 단위**. 정규 수업 전체를 바꾸려면 `class_templates.instructor_staff_id`를 변경하고 이후 생성 회차부터 반영(기존 회차는 개별 대체).

### 8.2 배정 규칙

```
대체 배정 허용 ⇔ session.session_status ∈ {scheduled, open, closed}   # completed/canceled 불가
              AND substitute_staff.status = 'active'                  # canon §2-8
              AND 동일 시간대 강사 중복 없음(룸/강사 슬롯 충돌 검사)
대체 후:
  session.substitute_staff_id = substitute_staff.id
  audit_log('update', session)
  (예약 회원에게 강사 변경 안내 — 알림 템플릿 운영 시)
```

### 8.3 회계·정산 귀속 (canon §4.2, §2-26 연계)

- **소진기준 매출의 강사 귀속**은 회차의 **실제 진행 강사** 기준이다. 대체 배정이 있으면 `revenue_records.instructor_staff_id`에는 **`substitute_staff_id`가 있으면 그것을, 없으면 `instructor_staff_id`**를 기록한다(실제 수업한 강사가 수익성·정산의 주체).
- 강사 정산(`settlements.session_count`, canon §2-26)은 **출석 기준 수업 수**로 집계되며, 대체 진행한 회차는 대체 강사에게 귀속된다.
- 이 귀속 규칙은 [`19-metrics.md`](./19-metrics.md)(강사별 수익성)·[`16-payment-refund-policy.md`](./16-payment-refund-policy.md)와 일관되게 적용한다.

### 8.4 1:1 vs 그룹 대체 차이

| 항목 | 1:1(`personal`) | 그룹(`group`) |
|---|---|---|
| 대체 빈도 | 높음(전담 강사 부재 시 필수) | 발생 시 회차 단위 |
| 회원 동의 | 사전 안내·동의 권장(전담성 강함) | 안내 |
| 슬롯 충돌 | 대체 강사의 동시간 다른 1:1과 충돌 금지 | 룸 정원 내 단일 진행 |

---

## 9. 상태 전이 요약도 (텍스트)

### 9.1 예약(`reservation_status`) 전이

```
[생성]
  정원 여유 → booked
  정원 충족 → waitlisted

booked ──정상취소(마감 전)──▶ canceled        (복구/홀드해제)
booked ──지각취소(마감 후)──▶ canceled        (late_cancel_deduct 적용)
booked ──출석처리──▶ attended | absent | no_show
waitlisted ──결원 자동전환──▶ booked          (TTL 부여)
waitlisted ──TTL만료/취소──▶ canceled
(전 상태) ──폐강──▶ canceled                  (restore_close 전원)
```

### 9.2 출석(`attendance_status`)과 차감 (요약)

```
attended/late  → 차감(정상 소진)
absent         → 차감(스튜디오 재량으로 면제 가능)
no_show        → no_show_deduct ? 차감 : 복구/홀드해제
excused        → 차감 면제(deducted=false)
```

### 9.3 회차(`session_status`) 전이

```
scheduled ─오픈도달─▶ open ─마감/정원충족─▶ closed ─종료─▶ completed
   open/closed ─폐강(자동:min미달 / 수동)─▶ canceled
   closed ─결원+마감전─▶ open (재오픈)
```

---

## 10. 정책 검증 체크리스트 (QA 연계, [`22-qa-checklist.md`](./22-qa-checklist.md))

- [ ] `passes.remaining_count` == 마지막 `pass_transactions.balance_after` (항상)
- [ ] `on_booking`/`on_attend` 정책이 한 스튜디오 내에서 혼용되지 않음
- [ ] 정상취소·폐강은 항상 복구(매트릭스 #9, #12), 폐강은 차감 정책 무관 전액 복구
- [ ] 노쇼 차감 on/off가 매트릭스 #7/#8대로 동작, 최종 차감 횟수가 두 `deduct_timing`에서 동일
- [ ] 차감 발생 = 소진기준 매출(`revenue_basis='consumption'`) 1건, 복구 시 음수 조정 1건
- [ ] 대기 자동전환 시 1일 한도·유효 수강권 재검사 통과분만 확정, TTL 만료 시 차순위 이전
- [ ] 자동 폐강은 그룹만, `booking_close_at`에서 `auto_close_min_count` 미달 평가
- [ ] 1:1은 자동 폐강·대기 미적용, 대체 배정 시 슬롯 충돌 없음
- [ ] 모든 차감/복구/폐강/대체 배정에 `audit_logs` 기록(canon §5)
- [ ] 대체 배정 회차의 소진매출·정산 귀속이 실제 진행 강사(`substitute_staff_id` 우선)로 기록

---

## 관련 문서

- [`00-canon.md`](./00-canon.md) — 단일 진실원천(테이블·enum·정책 기본값 §6.1, 이중 회계 §4, RBAC §5)
- [`03-scenarios.md`](./03-scenarios.md) — 예약·취소·노쇼 시나리오 흐름
- [`11-erd.md`](./11-erd.md) — `reservations`·`waitlists`·`attendance`·`pass_transactions` 상세 컬럼/제약
- [`12-api.md`](./12-api.md) — 예약 생성·취소·출석·대기 전환 API
- [`13-rbac.md`](./13-rbac.md) — 예약/출석/수강권 차감 권한 스코프
- [`15-pass-policy.md`](./15-pass-policy.md) — 수강권 정지/만료/연장·환불 복구 정책(차감 원장 공유)
- [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) — 환불 시 잔여 복구·정산 연계
- [`19-metrics.md`](./19-metrics.md) — 소진기준 매출·강사별/수업유형별 수익성 산식
- [`22-qa-checklist.md`](./22-qa-checklist.md) — 상태전이·차감 정합성 검증 항목
