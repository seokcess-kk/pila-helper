# 12-api.md — API 명세 초안

> **목적**: 필라테스 경영관리 SaaS의 REST API 계약 초안. 공통 규약(인증·테넌시 스코프·페이지네이션·정렬/필터·에러·멱등성)과 리소스별 엔드포인트 표 + 대표 요청/응답 JSON을 제공한다. 모든 필드명·enum 값·역할명은 [`00-canon.md`](./00-canon.md)와 글자 단위로 일치한다.

- **기준 버전**: v1.0 / 기준일 2026-06-12
- **베이스 URL**: `https://api.pila-helper.com/v1`
- **표기 규칙**: 본 문서에서 `[MVP]`=MVP 필수, `[2차]`=2차 확장, `[3차]`=3차 확장. 엔드포인트 표의 **단계** 열로도 구분한다.
- **상위 근거**: 본 문서는 [`00-canon.md`](./00-canon.md) §1(네이밍)·§2(엔티티)·§3(enum)·§4(회계모델)·§5(RBAC)·§6(정책)를 따른다. 스키마 상세는 [`11-erd.md`](./11-erd.md), 권한 상세는 [`13-rbac.md`](./13-rbac.md)가 소유한다.

---

## 1. 공통 규약 (Conventions)

### 1.1 프로토콜·포맷·버저닝

| 항목 | 규약 |
|---|---|
| 프로토콜 | HTTPS 전용. HTTP는 308로 리다이렉트하지 않고 거부. |
| 포맷 | 요청·응답 모두 `application/json; charset=utf-8`. CSV 업로드만 `multipart/form-data`. |
| 버저닝 | URL 경로 버전 `/v1`. 하위호환 깨지는 변경은 `/v2`로 분기. |
| 시각 | 모든 `_at` 필드는 **UTC ISO 8601**(`2026-06-12T01:30:00Z`)로 송수신. 클라이언트가 스튜디오 `timezone`(기본 `Asia/Seoul`)으로 표시(canon §1.4). |
| 날짜 | 모든 `_date` 필드는 KST 기준 `YYYY-MM-DD`(canon §1.4). |
| 금액 | 모든 `_amount` 필드는 **정수(원, KRW)**. 소수·문자열 금지(canon §1.3). |
| 식별자 | 모든 `id`는 UUID(v7) 문자열. |
| enum | DB·API 모두 **영문 snake_case 코드**만 전송. 한글 라벨은 클라이언트가 매핑(canon §0). |
| 필드 네이밍 | 응답 JSON 키는 DB 컬럼과 동일한 snake_case(canon §1.1). |

### 1.2 인증 (Authentication)

- 인증 방식: **Bearer JWT**. 모든 요청에 `Authorization: Bearer <access_token>` 헤더 필수(`/auth/login`, `/auth/refresh` 제외).
- 토큰 구조: access token(15분) + refresh token(14일, httpOnly 쿠키 또는 본문). access 만료 시 `/auth/refresh`로 재발급.
- 토큰 클레임(요약): `sub`(user_id), `tenant_id`, `role`(canon §3.18), `member_id`/`staff_id`(연결 시), `studio_ids`(접근 가능 스튜디오 목록).

```http
GET /v1/members?page=1&size=20 HTTP/1.1
Host: api.pila-helper.com
Authorization: Bearer eyJhbGciOiJI...
X-Studio-Id: 0c9f1a2b-7e44-7c10-9a3e-2b1f6d4e8a01
X-Request-Id: 9b2f...
```

### 1.3 테넌시 스코프 (Multi-tenant Scoping)

> canon §1.2·§5: 모든 비-`saas_admin` 요청은 **`tenant_id` + `studio_id` 범위**로 강제 격리된다. `tenant_id`는 토큰에서 도출(클라이언트가 변경 불가). 활성 스튜디오는 헤더로 지정한다.

| 헤더 | 필수 | 설명 |
|---|---|---|
| `X-Studio-Id` | 비-saas 역할 필수 | 현재 작업 대상 스튜디오 id. 토큰의 `studio_ids`에 포함되지 않으면 `403 studio_forbidden`. |
| `X-Request-Id` | 선택(권장) | 클라이언트 추적 ID. 응답에 echo. 로깅·감사 추적용. |
| `Idempotency-Key` | 쓰기 작업 권장 | §1.8 멱등성. |

- 서버는 **모든 쿼리에 `tenant_id = <token.tenant_id> AND studio_id = <X-Studio-Id> AND deleted_at IS NULL`을 무조건 주입**한다(애플리케이션 레벨 + DB Row-Level Security 병행 권장).
- `saas_admin`은 `X-Studio-Id` 없이 글로벌 SaaS 리소스(`/saas/*`)에 접근. 테넌트 데이터 접근 시 `X-Tenant-Id` + `X-Studio-Id`를 명시한다(읽기 위주).
- 회원(`member`) 토큰은 `member_id`로 추가 필터(`own` 스코프). 타인 데이터 요청은 `403`.

### 1.4 페이지네이션 (Pagination)

- 방식: **페이지 번호 기반**(`page`, `size`)을 기본 제공하고, 대용량/무한스크롤 리소스(거래내역·알림·감사로그)는 **커서 기반**(`cursor`)을 병행한다.

| 파라미터 | 기본 | 최대 | 설명 |
|---|---|---|---|
| `page` | 1 | — | 1부터 시작하는 페이지 번호. |
| `size` | 20 | 100 | 페이지당 항목 수. |
| `cursor` | — | — | 커서 토큰(불투명 문자열). 지정 시 `page` 무시. |

- 모든 목록 응답은 `data`(배열)와 `meta`(페이지 정보)를 포함한다(§1.7 응답 봉투).

### 1.5 정렬 (Sorting)

- 파라미터: `sort=<field>` 또는 `sort=-<field>`(접두 `-`=내림차순). 복수 정렬은 콤마 구분: `sort=-created_at,name`.
- 허용 필드는 리소스별로 화이트리스트(canon 컬럼만). 미허용 필드는 `422 invalid_sort`.
- 예: `GET /members?sort=-created_at` → 최근 생성순.

### 1.6 필터 (Filtering)

- 동등 필터: `?<field>=<value>` (예: `?member_status=enrolled`).
- 다중 값(IN): 콤마 구분 (예: `?payment_status=receivable,partial`).
- 범위 필터: `?<field>_from=` / `?<field>_to=` (예: `?recognized_date_from=2026-06-01&recognized_date_to=2026-06-30`).
- 검색: `?q=<keyword>` (리소스별 지정 필드 부분일치, 예: members는 `name`/`phone`).
- 모든 필터 키·enum 값은 canon §2/§3 컬럼에 한정. 미허용 키는 무시하지 않고 `422 invalid_filter`로 응답(오타 조기 발견).

### 1.7 응답 봉투 (Response Envelope)

**단건 성공**
```json
{
  "data": { "id": "0c9f...", "name": "김지은" },
  "meta": { "request_id": "9b2f...", "server_time": "2026-06-12T01:30:05Z" }
}
```

**목록 성공**
```json
{
  "data": [ { "id": "..." }, { "id": "..." } ],
  "meta": {
    "request_id": "9b2f...",
    "page": 1,
    "size": 20,
    "total_count": 134,
    "total_pages": 7,
    "next_cursor": "eyJpZCI6..."
  }
}
```

- 생성 성공: `201 Created` + `Location` 헤더 + 생성 리소스 `data`.
- 수정 성공: `200 OK` + 갱신 리소스 `data`.
- 삭제(소프트) 성공: `200 OK` + `{ "data": { "id": "...", "deleted_at": "..." } }`. canon §1.2에 따라 **물리 삭제는 하지 않는다**(금전·감사 데이터).

### 1.8 멱등성 (Idempotency)

> 결제·환불·차감·CSV 업로드 등 **금전/원장 생성 작업**은 네트워크 재시도로 인한 중복 생성을 막아야 한다.

- 클라이언트는 `POST`(생성)·`PATCH`(상태전이) 요청에 `Idempotency-Key: <uuid>` 헤더를 전송한다.
- 서버는 `(tenant_id, endpoint, idempotency_key)` 조합으로 24시간 결과를 캐시한다.
  - 동일 키 + 동일 바디 재요청 → **저장된 동일 응답**을 반환(중복 생성 안 함).
  - 동일 키 + 다른 바디 → `409 idempotency_key_conflict`.
- 멱등성 필수 권장 엔드포인트: `POST /payments`, `POST /refunds`, `POST /reservations`, `POST /passes/{id}/transactions`, `POST /expenses/import`, `POST /banking/transactions/import`.

### 1.9 동시성 제어 (Concurrency)

- 변경 충돌 방지를 위해 `If-Match`(ETag) 또는 본문 `expected_updated_at`을 사용한다. 불일치 시 `409 stale_resource`.
- 예약 정원·수강권 잔여 차감은 서버에서 **행 잠금(SELECT … FOR UPDATE) + 트랜잭션**으로 처리(canon §4, 차감 원장 `pass_transactions` append-only).

### 1.10 에러 응답 포맷 (Error Format)

```json
{
  "error": {
    "code": "validation_failed",
    "message": "요청 본문 검증에 실패했습니다.",
    "status": 422,
    "request_id": "9b2f...",
    "details": [
      { "field": "phone", "reason": "required" },
      { "field": "member_status", "reason": "invalid_enum", "allowed": ["new_inquiry","consulting","trial_booked","trial_done","enrolled","dormant","expired","re_enrolled"] }
    ]
  }
}
```

**표준 에러 코드**

| HTTP | code | 의미 |
|---|---|---|
| 400 | `bad_request` | 파싱 불가/형식 오류 |
| 401 | `unauthorized` | 토큰 없음/만료/위조 |
| 403 | `forbidden` | 권한 부족(RBAC, canon §5) |
| 403 | `studio_forbidden` | `X-Studio-Id`가 토큰 스코프 밖 |
| 404 | `not_found` | 리소스 없음 또는 스코프 밖(존재 은닉) |
| 409 | `conflict` | 상태 충돌(예: 이미 취소된 예약) |
| 409 | `idempotency_key_conflict` | 멱등키 재사용 충돌 |
| 409 | `stale_resource` | 낙관적 락 충돌 |
| 422 | `validation_failed` | 본문/쿼리 검증 실패 |
| 422 | `business_rule_violation` | 정책 위반(예: 취소마감 경과) |
| 429 | `rate_limited` | 호출 한도 초과(`Retry-After` 헤더) |
| 500 | `internal_error` | 서버 오류 |

- 정책 위반은 `business_rule_violation`에 `rule` 키로 구체화: 예 `{ "rule": "cancel_deadline_passed", "cancel_deadline_minutes": 120 }`(canon §6.1).

### 1.11 감사 로그 (Audit) 연동

> canon §1.2·§5·§2(38 `audit_logs`): **모든 수정/삭제/환불/수강권 차감/매칭/내보내기/로그인**은 서버가 자동으로 `audit_logs`에 기록한다(클라이언트 추가 호출 불필요).

- 기록 `action`: `create`·`update`·`delete`·`refund`·`pass_adjust`·`match`·`login`·`export`.
- `actor_user_id`·`actor_role`·`entity_type`·`entity_id`·`before_json`·`after_json`·`ip_address`·`occurred_at` 자동 채움.

### 1.12 권한 적용 원칙 (RBAC)

- 모든 엔드포인트는 canon §5 매트릭스의 리소스×액션×스코프로 보호된다. 각 엔드포인트 표의 **권한** 열에 허용 역할을 표기한다.
- 스코프 표기: `all`(스튜디오 전체)·`assigned`(담당)·`own`(본인). 강사(`instructor`)는 전체 매출·통장 잔액 접근 불가(canon §5).

### 1.13 레이트 리밋 (Rate Limit)

- 기본 600 req/분/토큰. 초과 시 `429 rate_limited` + `Retry-After`(초) + `X-RateLimit-Remaining` 헤더.
- CSV 업로드·내보내기는 별도 저빈도 버킷(분당 10).

---

## 2. 인증·권한 API (auth / roles / permissions)

### 2.1 엔드포인트

| 메서드 | 경로 | 설명 | 권한 | 단계 |
|---|---|---|---|---|
| POST | `/auth/login` | 이메일+비밀번호 로그인, 토큰 발급 | 공개 | MVP |
| POST | `/auth/refresh` | refresh로 access 재발급 | 공개(refresh 보유) | MVP |
| POST | `/auth/logout` | refresh 무효화 | 인증 | MVP |
| GET | `/auth/me` | 현재 사용자·역할·스튜디오 조회 | 인증 | MVP |
| POST | `/auth/password/change` | 비밀번호 변경 | 본인 | MVP |
| POST | `/auth/member/otp/request` | 회원 모바일웹 휴대폰 OTP 요청 | 공개 | MVP |
| POST | `/auth/member/otp/verify` | OTP 검증 후 회원 토큰 발급 | 공개 | MVP |
| GET | `/roles` | 역할 코드 사전 조회(canon §3.18) | owner·manager·saas_admin | MVP |
| GET | `/permissions` | 역할-권한 매핑 조회 | owner·saas_admin | MVP |
| PATCH | `/permissions` | 역할-권한 매핑 수정 | owner·saas_admin | 2차 |

### 2.2 예시 — 로그인

**요청** `POST /v1/auth/login`
```json
{ "email": "owner@studioA.kr", "password": "••••••••" }
```

**응답** `200 OK`
```json
{
  "data": {
    "access_token": "eyJhbGci...",
    "refresh_token": "def502...",
    "token_type": "Bearer",
    "expires_in": 900,
    "user": {
      "id": "7a1c...", "email": "owner@studioA.kr",
      "role": "owner", "tenant_id": "11ff...",
      "studio_ids": ["0c9f...", "0c9f...b"],
      "staff_id": "5d2e...", "member_id": null,
      "status": "active"
    }
  },
  "meta": { "request_id": "9b2f..." }
}
```

### 2.3 예시 — 권한 조회

**응답** `GET /v1/permissions` → canon §2(5 `permissions`) 구조
```json
{
  "data": [
    { "role_code": "instructor", "resource": "members", "action": "read", "scope": "assigned" },
    { "role_code": "instructor", "resource": "revenue", "action": "read", "scope": "assigned" },
    { "role_code": "accountant", "resource": "expenses", "action": "create", "scope": "all" }
  ],
  "meta": { "request_id": "9b2f..." }
}
```

---

## 3. 회원 API (members)

> canon §2(6 `members`), enum `member_status`(§3.1), `tag`(§3.17).

### 3.1 엔드포인트

| 메서드 | 경로 | 설명 | 권한 | 단계 |
|---|---|---|---|---|
| GET | `/members` | 회원 목록(검색·필터·페이지) | owner·manager·info_staff·accountant(R), instructor(assigned) | MVP |
| POST | `/members` | 회원/상담고객 등록 | owner·manager·info_staff | MVP |
| GET | `/members/{id}` | 회원 상세 | 위 + member(own) | MVP |
| PATCH | `/members/{id}` | 회원 정보 수정 | owner·manager·info_staff | MVP |
| DELETE | `/members/{id}` | 회원 소프트 삭제 | owner·manager | MVP |
| GET | `/members/{id}/passes` | 회원 수강권 목록 | owner·manager·info_staff·member(own) | MVP |
| GET | `/members/{id}/reservations` | 회원 예약 이력 | 위 동일 | MVP |
| GET | `/members/{id}/payments` | 회원 결제·환불 이력 | owner·manager·accountant·member(own) | MVP |
| GET | `/members/{id}/counseling-logs` | 회원 상담 이력 | owner·manager·info_staff | MVP |
| GET | `/members/{id}/notifications` | 회원 알림 발송 이력 | owner·manager·info_staff·member(own) | MVP |
| POST | `/members/{id}/tags` | 태그 부여(canon §3.17) | owner·manager·info_staff | MVP |
| DELETE | `/members/{id}/tags/{tag}` | 태그 제거 | owner·manager·info_staff | MVP |

**필터(GET /members)**: `member_status`, `assigned_staff_id`, `tag`, `marketing_source`, `q`(name/phone), `created_at_from`/`_to`. **정렬**: `created_at`, `name`.

### 3.2 예시 — 회원 등록

**요청** `POST /v1/members`
```json
{
  "name": "김지은",
  "phone": "010-2345-6789",
  "gender": "female",
  "birth_date": "1992-04-18",
  "member_status": "new_inquiry",
  "marketing_source": "instagram",
  "goal": "체형교정·코어강화",
  "medical_note": "오른쪽 어깨 충돌증후군 주의",
  "memo": "오전 시간대 선호",
  "assigned_staff_id": "5d2e..."
}
```

**응답** `201 Created`
```json
{
  "data": {
    "id": "8f31...",
    "tenant_id": "11ff...", "studio_id": "0c9f...",
    "name": "김지은", "phone": "010-2345-6789",
    "gender": "female", "birth_date": "1992-04-18",
    "member_status": "new_inquiry",
    "marketing_source": "instagram",
    "goal": "체형교정·코어강화",
    "medical_note": "오른쪽 어깨 충돌증후군 주의",
    "memo": "오전 시간대 선호",
    "assigned_staff_id": "5d2e...",
    "tags": [],
    "created_at": "2026-06-12T01:30:00Z",
    "created_by": "7a1c..."
  },
  "meta": { "request_id": "9b2f..." }
}
```

### 3.3 예시 — 상태 전이

**요청** `PATCH /v1/members/8f31...`
```json
{ "member_status": "enrolled", "expected_updated_at": "2026-06-12T01:30:00Z" }
```
> `member_status`는 canon §3.1 enum만 허용. 잘못된 값은 `422 validation_failed`(`invalid_enum`). 상태 전이 규칙은 [`03-scenarios.md`] 흐름을 따른다.

---

## 4. 상담 CRM API (leads / counseling-logs / marketing-sources)

> canon §2(7 `leads`, 9 `counseling_logs`, 10 `marketing_sources`), enum `lead_status`(§3.2), `marketing_source`(§3.16).

### 4.1 엔드포인트

| 메서드 | 경로 | 설명 | 권한 | 단계 |
|---|---|---|---|---|
| GET | `/leads` | 상담 파이프라인 목록 | owner·manager·info_staff, instructor(assigned) | MVP |
| POST | `/leads` | 신규 문의 등록 | owner·manager·info_staff | MVP |
| GET | `/leads/{id}` | 리드 상세 | 위 동일 | MVP |
| PATCH | `/leads/{id}` | 상태/날짜/담당자 갱신 | owner·manager·info_staff | MVP |
| POST | `/leads/{id}/convert` | 리드→회원 전환(member 연결·승격) | owner·manager·info_staff | MVP |
| GET | `/leads/summary` | 상담 파이프라인 단계별 건수 요약(기간 필터) | owner·manager·info_staff, accountant | MVP |
| GET | `/leads/conversion` | 체험→등록 전환율 집계(체험완료 대비 등록, 기간 필터) | owner·manager·info_staff, accountant | MVP |
| GET | `/counseling-logs` | 상담 이력 목록 | owner·manager·info_staff | MVP |
| POST | `/counseling-logs` | 상담 기록 추가 | owner·manager·info_staff | MVP |
| GET | `/marketing-sources` | 유입경로 사전 | owner·manager·info_staff·accountant | MVP |
| POST | `/marketing-sources` | 커스텀 유입경로 추가 | owner·manager | 2차 |

**필터(GET /leads)**: `lead_status`, `marketing_source`, `assigned_staff_id`, `inquiry_date_from`/`_to`, `q`(name/phone). **정렬**: `inquiry_date`, `created_at`.

### 4.2 예시 — 신규 문의 등록

**요청** `POST /v1/leads`
```json
{
  "name": "박서연", "phone": "010-9876-5432",
  "lead_status": "new_inquiry",
  "marketing_source": "naver_place",
  "inquiry_date": "2026-06-12",
  "assigned_staff_id": "5d2e..."
}
```

**응답** `201 Created`
```json
{
  "data": {
    "id": "a210...", "member_id": null,
    "name": "박서연", "phone": "010-9876-5432",
    "lead_status": "new_inquiry", "marketing_source": "naver_place",
    "inquiry_date": "2026-06-12",
    "trial_booked_date": null, "trial_done_date": null, "enrolled_date": null,
    "lost_reason": null, "assigned_staff_id": "5d2e...",
    "created_at": "2026-06-12T01:35:00Z"
  },
  "meta": { "request_id": "9b2f..." }
}
```

### 4.3 예시 — 상담 기록 추가

**요청** `POST /v1/counseling-logs`
```json
{
  "lead_id": "a210...", "member_id": null, "staff_id": "5d2e...",
  "channel": "call",
  "content": "체험수업 6/15 14시 예약 안내. 어깨 통증 상담.",
  "consulted_at": "2026-06-12T02:10:00Z",
  "next_action_at": "2026-06-14T01:00:00Z"
}
```
> 리드 상태가 `trial_booked`로 진행되면 클라이언트가 `PATCH /leads/{id}`로 `lead_status`·`trial_booked_date`를 갱신한다.

### 4.4 예시 — 리드→회원 전환

**요청** `POST /v1/leads/a210.../convert`
```json
{ "member_id": null, "set_member_status": "trial_done" }
```
> `member_id`가 null이면 신규 `members` 레코드를 생성해 연결하고, 값이 있으면 기존 회원에 리드를 귀속시킨다. 응답에 `member`와 갱신된 `lead`를 함께 반환한다.

### 4.5 예시 — 체험→등록 전환율 집계

> US-B3(체험→등록 기본 전환율) 및 IA A-4(전환 분석) 대응 **MVP 근거 엔드포인트**. `leads`의 단계 날짜(`trial_done_date`·`enrolled_date`, canon §2.7)와 `lead_status`(canon §3.2: `trial_done`·`enrolled`) 기준으로 산출한다. 비율은 저장하지 않고 **조회 시 계산**한다(canon §1.3). 전환율 분해(유입경로별 수익성 포함)는 2차 `/dashboard/profit/by-source`(§11)·`/revenue-records/breakdown`(§9)가 이어받는다.

**요청** `GET /v1/leads/conversion?inquiry_date_from=2026-06-01&inquiry_date_to=2026-06-30`

**응답** `200 OK`
```json
{
  "data": {
    "period": { "from": "2026-06-01", "to": "2026-06-30" },
    "new_inquiry_count": 40,
    "trial_done_count": 25,
    "enrolled_count": 15,
    "trial_conversion_rate": 0.6000,
    "inquiry_to_enroll_rate": 0.3750
  },
  "meta": { "request_id": "9b2f..." }
}
```
> 산식: `trial_conversion_rate`(체험→등록) = `enrolled_count` ÷ `trial_done_count` = 15 ÷ 25 = 0.6000(US-B3 60% 계산 예시와 일치). `inquiry_to_enroll_rate`(문의→등록) = `enrolled_count` ÷ `new_inquiry_count` = 15 ÷ 40 = 0.3750. `_rate`는 numeric(7,4) 표현(canon §1.3). 기간은 `inquiry_date_from`/`_to`로 필터(canon §1.6 범위 필터). `marketing_source`(canon §3.16) 필터를 추가하면 유입경로별 전환율을 산출할 수 있다. `GET /leads/summary`는 동일 기간 필터로 단계별 건수(`new_inquiry`/`contacted`/`trial_booked`/`trial_done`/`enrolled`/`on_hold`/`lost`, canon §3.2)를 반환한다. 상세 지표 정의는 [`19-metrics.md`].

---

## 5. 수업 API (rooms / class-templates / class-sessions)

> canon §2(11 `rooms`, 12 `class_templates`, 13 `class_sessions`), enum `class_type`(§3.3), `session_status`(§3.4). 정책 오버라이드 키는 canon §6.1.

### 5.1 엔드포인트

| 메서드 | 경로 | 설명 | 권한 | 단계 |
|---|---|---|---|---|
| GET | `/rooms` | 공간 목록 | owner·manager·info_staff·instructor | MVP |
| POST | `/rooms` | 공간 등록 | owner·manager | MVP |
| GET | `/class-templates` | 반복수업 템플릿 목록 | owner·manager·info_staff·instructor | MVP |
| POST | `/class-templates` | 템플릿 생성 | owner·manager | MVP |
| PATCH | `/class-templates/{id}` | 템플릿 수정 | owner·manager | MVP |
| POST | `/class-templates/{id}/generate-sessions` | RRULE 기반 회차 생성 | owner·manager | MVP |
| GET | `/class-sessions` | 수업 회차 목록(달력) | 위 + member(공개 회차) | MVP |
| POST | `/class-sessions` | 단일 수업 회차 생성 | owner·manager | MVP |
| GET | `/class-sessions/{id}` | 회차 상세(예약현황 포함) | 위 동일 | MVP |
| PATCH | `/class-sessions/{id}` | 회차 수정(시간·정원·상태) | owner·manager, instructor(assigned: 상태·메모) | MVP |
| POST | `/class-sessions/{id}/cancel` | 폐강 처리(`session_status=canceled`, 예약 복구) | owner·manager | MVP |
| POST | `/class-sessions/{id}/substitute` | 대체 강사 배정 | owner·manager | MVP |
| GET | `/class-sessions/{id}/roster` | 예약자·출석 명단 | owner·manager·info_staff·instructor(assigned) | MVP |

**필터(GET /class-sessions)**: `class_type`, `session_status`, `instructor_staff_id`, `room_id`, `is_public`, `start_at_from`/`_to`. **정렬**: `start_at`.

### 5.2 예시 — 템플릿 생성

**요청** `POST /v1/class-templates`
```json
{
  "class_type": "group",
  "name": "오전 그룹 리포머 A",
  "instructor_staff_id": "5d2e...",
  "room_id": "r001...",
  "capacity": 6,
  "duration_minutes": 50,
  "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=10;BYMINUTE=0",
  "is_public": true,
  "booking_open_days": 14,
  "booking_close_minutes": 60,
  "cancel_deadline_minutes": 120
}
```
> `booking_open_days`/`booking_close_minutes`/`cancel_deadline_minutes`는 미지정 시 스튜디오 `policy_json` 기본값(canon §6.1: 14일/60분/120분) 상속.

### 5.3 예시 — 회차 상세(예약 현황)

**응답** `GET /v1/class-sessions/cs77...`
```json
{
  "data": {
    "id": "cs77...", "class_template_id": "ct12...",
    "class_type": "group",
    "instructor_staff_id": "5d2e...", "substitute_staff_id": null,
    "room_id": "r001...",
    "start_at": "2026-06-15T01:00:00Z", "end_at": "2026-06-15T01:50:00Z",
    "capacity": 6, "waitlist_capacity": 4,
    "session_status": "open", "is_public": true,
    "reserved_count": 4, "available_count": 2, "waitlisted_count": 0
  },
  "meta": { "request_id": "9b2f..." }
}
```
> `reserved_count`/`available_count`/`waitlisted_count`는 서버 집계 파생값(저장 컬럼 아님).

---

## 6. 예약·대기·출석 API (reservations / waitlists / attendance)

> canon §2(14 `reservations`, 15 `waitlists`, 16 `attendance`), enum `reservation_status`(§3.5), `attendance_status`(§3.6). 차감 정책은 canon §6.1(`deduct_timing`·`cancel_deadline_minutes`·`no_show_deduct`·`late_cancel_deduct`). 상세 정책은 [`14-booking-policy.md`].

### 6.1 엔드포인트

| 메서드 | 경로 | 설명 | 권한 | 단계 |
|---|---|---|---|---|
| GET | `/reservations` | 예약 목록 | owner·manager·info_staff, instructor(assigned), member(own) | MVP |
| POST | `/reservations` | 예약 생성(회원 직접/관리자 대리) | 위 동일 | MVP |
| GET | `/reservations/{id}` | 예약 상세 | 위 동일 | MVP |
| POST | `/reservations/{id}/cancel` | 예약 취소(정책에 따른 차감 판정) | owner·manager·info_staff·member(own) | MVP |
| POST | `/class-sessions/{id}/waitlists` | 대기 신청 | owner·manager·info_staff·member(own) | MVP |
| GET | `/waitlists` | 대기 목록 | owner·manager·info_staff·member(own) | MVP |
| POST | `/waitlists/{id}/promote` | 대기→예약 수동 전환 | owner·manager·info_staff | MVP |
| DELETE | `/waitlists/{id}` | 대기 취소 | owner·manager·info_staff·member(own) | MVP |
| POST | `/reservations/{id}/attendance` | 출석/지각/결석/노쇼 처리 | owner·manager·info_staff, instructor(assigned) | MVP |
| PATCH | `/attendance/{id}` | 출석 결과 수정(차감 재판정) | owner·manager, instructor(assigned) | MVP |
| GET | `/attendance` | 출석 이력 | owner·manager·info_staff·instructor(assigned) | MVP |

**필터(GET /reservations)**: `class_session_id`, `member_id`, `reservation_status`, `is_self_booked`, `booked_at_from`/`_to`. **정렬**: `booked_at`.

### 6.2 예약 생성 — 차감 시점 분기

> canon §6.1 `deduct_timing`: 기본 `on_attend`(출석 시 차감). `on_booking`이면 예약 생성 시 즉시 `pass_transactions`에 `deduct_booking`(delta −1) 1건 생성 + `passes.remaining_count` 감소. 두 경우 모두 정원 초과면 `waitlisted` 처리.

**요청** `POST /v1/reservations` (`Idempotency-Key` 권장)
```json
{
  "class_session_id": "cs77...",
  "member_id": "8f31...",
  "pass_id": "ps55...",
  "is_self_booked": false
}
```

**응답(정원 내, 차감 시점=on_booking)** `201 Created`
```json
{
  "data": {
    "reservation": {
      "id": "rv90...", "class_session_id": "cs77...",
      "member_id": "8f31...", "pass_id": "ps55...",
      "reservation_status": "booked",
      "booked_at": "2026-06-12T02:00:00Z",
      "is_self_booked": false,
      "pass_transaction_id": "pt01..."
    },
    "pass_transaction": {
      "id": "pt01...", "pass_id": "ps55...",
      "reason": "deduct_booking", "delta": -1, "balance_after": 9,
      "reservation_id": "rv90..."
    }
  },
  "meta": { "request_id": "9b2f..." }
}
```

**응답(정원 초과)** `201 Created`
```json
{
  "data": {
    "reservation": { "id": "rv91...", "reservation_status": "waitlisted", "pass_transaction_id": null },
    "waitlist": { "id": "wl12...", "class_session_id": "cs77...", "member_id": "8f31...", "position": 1, "status": "waiting", "requested_at": "2026-06-12T02:00:00Z" }
  },
  "meta": { "request_id": "9b2f..." }
}
```

### 6.3 예약 취소 — 정책 판정

> 취소마감(`cancel_deadline_minutes`, 기본 120분) 이전이면 무차감 + 차감분 복구(`restore_cancel`). 마감 이후이면 정책(`late_cancel_deduct=true`)에 따라 차감 유지. 차감 시점이 `on_attend`였다면 미차감 상태이므로 복구 없이 취소.

**요청** `POST /v1/reservations/rv90.../cancel`
```json
{ "cancel_reason": "개인 사정" }
```

**응답(마감 전, 복구 발생)** `200 OK`
```json
{
  "data": {
    "reservation": { "id": "rv90...", "reservation_status": "canceled", "canceled_at": "2026-06-12T03:00:00Z", "cancel_reason": "개인 사정" },
    "pass_transaction": { "id": "pt02...", "reason": "restore_cancel", "delta": 1, "balance_after": 10 },
    "deducted": false
  },
  "meta": { "request_id": "9b2f..." }
}
```

**응답(마감 후, 차감 유지)** `200 OK`
```json
{
  "data": {
    "reservation": { "id": "rv90...", "reservation_status": "canceled", "canceled_at": "2026-06-15T00:30:00Z" },
    "pass_transaction": null,
    "deducted": true,
    "policy": { "rule": "late_cancel_deduct", "cancel_deadline_minutes": 120 }
  },
  "meta": { "request_id": "9b2f..." }
}
```

### 6.4 출석 처리 — 노쇼 차감

> canon §6.1 `no_show_deduct=true`: 노쇼 시 차감. `attended`/`late`도 차감 시점이 `on_attend`면 이때 `deduct_attend`(delta −1) 발생. `excused`(사유결석)는 차감 면제 가능(canon §3.6).

**요청** `POST /v1/reservations/rv90.../attendance`
```json
{ "attendance_status": "no_show" }
```

**응답** `201 Created`
```json
{
  "data": {
    "attendance": {
      "id": "at33...", "reservation_id": "rv90...",
      "class_session_id": "cs77...", "member_id": "8f31...",
      "attendance_status": "no_show",
      "checked_at": "2026-06-15T02:00:00Z",
      "checked_by": "7a1c...", "deducted": true
    },
    "pass_transaction": { "id": "pt05...", "reason": "deduct_attend", "delta": -1, "balance_after": 8 },
    "reservation_status": "no_show"
  },
  "meta": { "request_id": "9b2f..." }
}
```
> 노쇼 누적 회원에는 서버가 `no_show_risk` 태그(canon §3.17)를 자동 부여할 수 있다.

---

## 7. 상품·수강권·차감 API (products / passes / pass-transactions)

> canon §2(17 `products`, 18 `passes`, 19 `pass_transactions`), enum `pass_kind`(§3.7), `pass_status`(§3.8), `pass_txn_reason`(§3.9). 수강권 정책 canon §6.2, 상세 [`15-pass-policy.md`].

### 7.1 엔드포인트

| 메서드 | 경로 | 설명 | 권한 | 단계 |
|---|---|---|---|---|
| GET | `/products` | 상품(권종) 목록 | owner·manager·info_staff·accountant·member(공개) | MVP |
| POST | `/products` | 상품 등록 | owner·manager | MVP |
| PATCH | `/products/{id}` | 상품 수정 | owner·manager | MVP |
| GET | `/passes` | 수강권 목록 | owner·manager·info_staff, member(own) | MVP |
| GET | `/passes/{id}` | 수강권 상세(잔여·만료) | 위 동일 | MVP |
| POST | `/passes/{id}/pause` | 홀딩(정지) | owner·manager·info_staff | MVP |
| POST | `/passes/{id}/resume` | 정지 해제 | owner·manager·info_staff | MVP |
| POST | `/passes/{id}/extend` | 만료일 연장 | owner·manager | MVP |
| GET | `/passes/{id}/transactions` | 수강권 증감 원장 | owner·manager·info_staff·member(own) | MVP |
| POST | `/passes/{id}/transactions` | 수동 차감/복구(`manual_deduct`/`manual_restore`) | owner·manager | MVP |

> **수강권 발급은 별도 엔드포인트를 두지 않는다.** `POST /purchases`(§8)가 결제와 함께 `passes`를 발급한다(canon §2: 1구매=1수강권 발급 기본). `unit_price_amount`는 발급 시 `round(final_amount / total_count)`로 고정(canon §4.2).

**필터(GET /passes)**: `member_id`, `pass_kind`, `pass_status`, `expire_date_from`/`_to`(만료임박), `remaining_count_to`(잔여 부족). **정렬**: `expire_date`, `remaining_count`.

### 7.2 예시 — 상품 등록

**요청** `POST /v1/products`
```json
{
  "name": "그룹 10회권(3개월)",
  "pass_kind": "group",
  "total_count": 10,
  "valid_days": 90,
  "price_amount": 350000,
  "allowed_class_types": ["group"],
  "holdable": true,
  "max_hold_days": 30
}
```

### 7.3 예시 — 수강권 상세

**응답** `GET /v1/passes/ps55...`
```json
{
  "data": {
    "id": "ps55...", "member_id": "8f31...", "product_id": "pr10...",
    "purchase_id": "pu20...", "pass_kind": "group",
    "total_count": 10, "remaining_count": 8,
    "start_date": "2026-06-12", "expire_date": "2026-09-10",
    "pass_status": "active",
    "paused_at": null, "paused_days_used": 0,
    "unit_price_amount": 35000
  },
  "meta": { "request_id": "9b2f..." }
}
```
> `unit_price_amount = round(final_amount / total_count) = round(350000 / 10) = 35000`(canon §4.2). 소진기준 매출 산정 단가.

### 7.4 예시 — 홀딩(정지)

**요청** `POST /v1/passes/ps55.../pause`
```json
{ "pause_days": 14, "reason": "여행" }
```
> canon §6.2 `max_hold_days=30` 초과 시 `422 business_rule_violation`(`rule: max_hold_days_exceeded`). 정지 중에는 만료일이 정지일수만큼 자동 연장된다.

### 7.5 예시 — 수동 차감/복구

**요청** `POST /v1/passes/ps55.../transactions` (`Idempotency-Key` 권장)
```json
{ "reason": "manual_restore", "delta": 1, "memo": "강사 착오 차감 정정" }
```
> `reason`은 canon §3.9 enum만 허용. `manual_deduct`(−)/`manual_restore`(+). 모든 증감은 `audit_logs`에 `pass_adjust`로 자동 기록(canon §1.11). `balance_after`는 서버가 계산해 응답.

---

## 8. 구매·결제·환불 API (purchases / payments / refunds)

> canon §2(20 `purchases`, 21 `payments`, 22 `refunds`), enum `payment_status`(§3.10), `payment_method`(§3.11). 결제/환불 정책 canon §6.3, 상세 [`16-payment-refund-policy.md`]. **모든 환불은 `audit_logs`에 `refund` 자동 기록**(canon §1.11).

### 8.1 엔드포인트

| 메서드 | 경로 | 설명 | 권한 | 단계 |
|---|---|---|---|---|
| POST | `/purchases` | 구매+수강권 발급(+결제 동시 생성) | owner·manager·info_staff | MVP |
| GET | `/purchases` | 구매 목록 | owner·manager·accountant | MVP |
| GET | `/purchases/{id}` | 구매 상세(결제·발급 연결) | owner·manager·accountant·member(own) | MVP |
| GET | `/payments` | 결제 목록(상태 필터) | owner·manager·accountant | MVP |
| POST | `/payments` | 결제 기록 추가(추가입금 등) | owner·manager·info_staff | MVP |
| GET | `/payments/{id}` | 결제 상세 | owner·manager·accountant·member(own) | MVP |
| PATCH | `/payments/{id}` | 입금 확정·미수 정정(상태 전이) | owner·manager·accountant | MVP |
| POST | `/refunds` | 환불 기록(부분/전액·잔여 회수) | owner·manager | MVP |
| GET | `/refunds` | 환불 목록 | owner·manager·accountant | MVP |
| GET | `/payments/receivables` | 미수금 목록(canon §4.4) | owner·manager·accountant | MVP |

**필터(GET /payments)**: `payment_status`, `payment_method`, `member_id`, `paid_at_from`/`_to`. **정렬**: `paid_at`, `created_at`.

### 8.2 예시 — 구매+발급+결제(현장카드)

**요청** `POST /v1/purchases` (`Idempotency-Key` 필수 권장)
```json
{
  "member_id": "8f31...",
  "product_id": "pr10...",
  "list_amount": 350000,
  "discount_amount": 0,
  "final_amount": 350000,
  "seller_staff_id": "5d2e...",
  "pass": { "start_date": "2026-06-12" },
  "payment": {
    "payment_method": "card_onsite",
    "amount": 350000,
    "paid_amount": 350000,
    "paid_at": "2026-06-12T05:00:00Z",
    "card_approval_no": "30021455",
    "staff_id": "5d2e..."
  }
}
```

**응답** `201 Created`
```json
{
  "data": {
    "purchase": {
      "id": "pu20...", "member_id": "8f31...", "product_id": "pr10...",
      "pass_id": "ps55...",
      "list_amount": 350000, "discount_amount": 0, "final_amount": 350000,
      "purchased_at": "2026-06-12T05:00:00Z", "seller_staff_id": "5d2e..."
    },
    "pass": {
      "id": "ps55...", "pass_kind": "group", "total_count": 10, "remaining_count": 10,
      "expire_date": "2026-09-10", "pass_status": "active", "unit_price_amount": 35000
    },
    "payment": {
      "id": "pm88...", "purchase_id": "pu20...",
      "payment_status": "paid", "payment_method": "card_onsite",
      "amount": 350000, "paid_amount": 350000, "receivable_amount": 0,
      "paid_at": "2026-06-12T05:00:00Z", "card_approval_no": "30021455"
    },
    "revenue_record": {
      "id": "rr01...", "revenue_basis": "payment", "source_type": "payment",
      "payment_id": "pm88...", "amount": 350000,
      "recognized_at": "2026-06-12T05:00:00Z", "recognized_date": "2026-06-12",
      "is_new_member": true, "is_re_enroll": false
    }
  },
  "meta": { "request_id": "9b2f..." }
}
```
> **결제기준 매출**(`revenue_basis=payment`)은 결제 즉시 1건 자동 생성(canon §4.1, `amount = paid_amount`). **소진기준 매출**(`consumption`)은 이후 수업 차감 시점마다 `pass_transactions` 발생과 함께 생성(canon §4.2). 두 기준은 중복 합산하지 않는다.

### 8.3 예시 — 무통장입금(입금대기→확정)

**요청 1** `POST /v1/purchases`(`payment.payment_method = "transfer"`, `paid_amount = 0`) → `payment_status: "awaiting_deposit"`, `receivable_amount = amount`.

**요청 2(입금 확인 후 상태 전이)** `PATCH /v1/payments/pm89...`
```json
{
  "payment_status": "paid",
  "paid_amount": 350000,
  "paid_at": "2026-06-13T01:00:00Z",
  "depositor_name": "김지은"
}
```
> 입금 확정 시 결제기준 매출 인식 시점은 스튜디오 정책 `revenue_recognition`(canon §6.3: `on_paid`/`on_deposit`)에 따른다. `on_deposit`이면 이 확정 시점에 `revenue_records`(payment) 생성.

### 8.4 예시 — 일부입금(미수금)

**요청** `PATCH /v1/payments/pm90...`
```json
{ "payment_status": "partial", "paid_amount": 200000 }
```
> `receivable_amount = amount − paid_amount = 350000 − 200000 = 150000`(canon §2.21). `GET /payments/receivables`에서 `payment_status in (receivable, partial)` 합으로 미수금 집계(canon §4.4).

### 8.5 예시 — 환불(부분, 잔여 회수)

> canon §6.3: 환불액 산정은 `refund_unit_basis`(기본 `list_price`)로 사용분 단가 공제 + `refund_penalty_rate`(기본 0.10) 위약 공제. 미소진 잔여횟수는 `restored_count`로 회수, 수강권은 `pass_status=refunded` 또는 잔여 조정.

**요청** `POST /v1/refunds` (`Idempotency-Key` 필수 권장)
```json
{
  "payment_id": "pm88...",
  "purchase_id": "pu20...",
  "member_id": "8f31...",
  "refund_amount": 252000,
  "refund_reason": "이사로 중도 환불",
  "restored_count": 8,
  "refund_method": "transfer"
}
```

**응답** `201 Created`
```json
{
  "data": {
    "refund": {
      "id": "rf01...", "payment_id": "pm88...", "purchase_id": "pu20...",
      "member_id": "8f31...", "refund_amount": 252000,
      "refund_reason": "이사로 중도 환불", "restored_count": 8,
      "status": "completed", "refund_method": "transfer",
      "refunded_at": "2026-06-20T02:00:00Z"
    },
    "payment": { "id": "pm88...", "payment_status": "refunded" },
    "pass": { "id": "ps55...", "pass_status": "refunded", "remaining_count": 0 },
    "revenue_record": {
      "id": "rr02...", "revenue_basis": "payment", "source_type": "refund",
      "payment_id": "pm88...", "amount": -252000,
      "recognized_at": "2026-06-20T02:00:00Z", "recognized_date": "2026-06-20"
    }
  },
  "meta": { "request_id": "9b2f..." }
}
```
> **환불 매출 반영**: 결제기준에 `source_type=refund`, `amount = −refund_amount`(음수) 1건 추가 → 순매출 자동 차감(canon §4.1). 미소진분(소진기준)은 애초 미인식이므로 자동 제외(canon §4.2). **참고 산식**: 사용 2회 × 정가단가 35,000 = 70,000 공제, 위약 350,000×0.10 = 35,000 공제 → 환불 350,000−70,000−(추가 정책) ≈ 정책별 산정. 실제 계산식은 [`16-payment-refund-policy.md`]가 소유.

---

## 9. 매출 API (revenue-records)

> canon §2(23 `revenue_records`), enum `revenue_basis`(§3.12), `class_type`(§3.3), `marketing_source`(§3.16). 이중 손익 모델 canon §4. 지표 산식 [`19-metrics.md`].

### 9.1 엔드포인트

| 메서드 | 경로 | 설명 | 권한 | 단계 |
|---|---|---|---|---|
| GET | `/revenue-records` | 매출 인식 원장 조회(기준 필터) | owner·accountant(all), manager(요약), instructor(assigned 매출만) | MVP |
| GET | `/revenue-records/summary` | 기준별 합계(결제/소진 토글) | owner·accountant(all), manager(요약) | MVP |
| GET | `/revenue-records/breakdown` | 수업유형/강사/유입경로별 분해(소진기준) | owner·accountant | 2차 |

**필터(GET /revenue-records)**: `revenue_basis`(payment/consumption, **필수**), `source_type`, `class_type`, `instructor_staff_id`, `marketing_source`, `is_new_member`, `is_re_enroll`, `recognized_date_from`/`_to`. **정렬**: `recognized_at`.

> **중요**: `revenue_basis`는 두 기준을 **절대 합산하지 않도록** 필수 단일 선택 파라미터다(canon §4 중복 합산 금지). 미지정 시 `422 validation_failed`(`field: revenue_basis, reason: required`).

### 9.2 예시 — 기준별 합계(결제기준)

**요청** `GET /v1/revenue-records/summary?revenue_basis=payment&recognized_date_from=2026-06-01&recognized_date_to=2026-06-30`

**응답** `200 OK`
```json
{
  "data": {
    "revenue_basis": "payment",
    "period": { "from": "2026-06-01", "to": "2026-06-30" },
    "gross_revenue_amount": 18400000,
    "refund_amount": -1260000,
    "net_revenue_amount": 17140000,
    "by_source_type": { "payment": 18400000, "refund": -1260000 },
    "new_member_amount": 6300000,
    "re_enroll_amount": 4200000
  },
  "meta": { "request_id": "9b2f..." }
}
```
> 산식(canon §4.4): 순매출 = Σ`revenue_records.amount`(선택 basis, 환불 음수 포함) = 18,400,000 + (−1,260,000) = 17,140,000.

### 9.3 예시 — 소진기준 분해(강사·수업유형별)

**요청** `GET /v1/revenue-records/breakdown?revenue_basis=consumption&recognized_date_from=2026-06-01&recognized_date_to=2026-06-30&group_by=class_type,instructor_staff_id`

**응답** `200 OK`
```json
{
  "data": {
    "revenue_basis": "consumption",
    "groups": [
      { "class_type": "personal", "instructor_staff_id": "5d2e...", "amount": 5400000, "session_count": 120 },
      { "class_type": "group", "instructor_staff_id": "5d2e...", "amount": 3150000, "session_count": 90 },
      { "class_type": "trial", "instructor_staff_id": "5d2e...", "amount": 0, "session_count": 12 }
    ]
  },
  "meta": { "request_id": "9b2f..." }
}
```
> 소진기준만 `class_type`·`instructor_staff_id`로 분해 가능(canon §4.2·§4.3). 결제기준은 상품 단위라 강사/수업유형 분해 불가.

---

## 10. 비용·거래내역·매칭 API (expenses / banking / cards / matching-rules)

> canon §2(24 `expense_records`, 25 `expense_categories`, 27 `bank_accounts`, 28 `bank_transactions`, 29 `card_sales`, 30 `card_expenses`, 31 `transaction_matching_rules`, 32 `transaction_reconciliation_logs`). enum `expense_category`(§3.13, 17종), `cost_type`(§3.14), `match_target`(§3.19), `reconciliation_stage`(§3.21). 정책 [`17-reconciliation-policy.md`]·[`18-expense-category-policy.md`].

### 10.1 엔드포인트 — 비용·카테고리

| 메서드 | 경로 | 설명 | 권한 | 단계 |
|---|---|---|---|---|
| GET | `/expense-categories` | 카테고리 사전(17종+커스텀) | owner·accountant | MVP |
| POST | `/expense-categories` | 커스텀 카테고리 추가 | owner·accountant | 2차 |
| GET | `/expenses` | 비용 원장 목록 | owner·accountant | MVP |
| POST | `/expenses` | 수동 비용 입력 | owner·accountant | MVP |
| GET | `/expenses/{id}` | 비용 상세 | owner·accountant | MVP |
| PATCH | `/expenses/{id}` | 비용 수정(카테고리·cost_type 재분류) | owner·accountant | MVP |
| DELETE | `/expenses/{id}` | 비용 소프트 삭제 | owner·accountant | MVP |
| GET | `/expenses/summary` | 고정비/변동비/카테고리별 합계 | owner·accountant | MVP |
| POST | `/expenses/{id}/receipt` | 증빙 파일 업로드 | owner·accountant | MVP |

**필터(GET /expenses)**: `expense_category`, `cost_type`, `source`(bank/card/manual), `is_recurring`, `vendor_name`, `expense_date_from`/`_to`. **정렬**: `expense_date`.

### 10.2 엔드포인트 — 통장·카드 거래내역(CSV·매칭)

| 메서드 | 경로 | 설명 | 권한 | 단계 |
|---|---|---|---|---|
| GET | `/banking/accounts` | 통장 계좌 목록 | owner·accountant | MVP |
| POST | `/banking/transactions/import` | 통장 거래내역 CSV 업로드 | owner·accountant | MVP |
| GET | `/banking/transactions` | 통장 거래내역 목록(미매칭 필터) | owner·accountant | MVP |
| GET | `/banking/transactions/{id}/suggestions` | 자동 추천 매칭(금액/날짜/이름) | owner·accountant | MVP |
| POST | `/banking/transactions/{id}/match` | 매출/비용/이체/기타 수동 분류·매칭 | owner·accountant | MVP |
| POST | `/cards/expenses/import` | 카드 사용내역 CSV 업로드 | owner·accountant | MVP |
| GET | `/cards/expenses` | 카드 사용내역 목록(미매칭 필터) | owner·accountant | MVP |
| POST | `/cards/expenses/{id}/match` | 카드사용→비용 분류·매칭 | owner·accountant | MVP |
| POST | `/cards/sales` | 카드매출 입금내역 수동 등록 | owner·accountant | MVP |
| GET | `/cards/sales` | 카드매출 목록(미입금 추적) | owner·accountant | MVP |
| PATCH | `/cards/sales/{id}` | 정산단계 갱신(승인→매입→입금) | owner·accountant | MVP |
| GET | `/matching-rules` | 자동 분류 규칙 목록 | owner·accountant | MVP |
| POST | `/matching-rules` | 규칙 추가(다음 거래부터 자동 적용) | owner·accountant | MVP |
| PATCH | `/matching-rules/{id}` | 규칙 수정 | owner·accountant | MVP |
| GET | `/reconciliation-logs` | 매칭/분류 처리 이력 | owner·accountant | MVP |
| GET | `/banking/accounts/sync` `/cards/sales/sync` | 오픈뱅킹·카드매출 자동 동기화 | owner·accountant | 3차 |

### 10.3 예시 — 수동 비용 입력

**요청** `POST /v1/expenses`
```json
{
  "expense_category": "rent",
  "cost_type": "fixed",
  "amount": 2200000,
  "vendor_name": "OO빌딩 임대",
  "expense_date": "2026-06-05",
  "source": "manual",
  "is_recurring": true,
  "doc_memo": "세금계산서 수취"
}
```
> `expense_category`(canon §3.13)와 `cost_type`(canon §3.14)은 enum만 허용. 미지정 시 카테고리의 `default_cost_type`(canon §3.13 표) 상속. `rent`의 기본 cost_type은 `fixed`.

### 10.4 예시 — 통장 CSV 업로드

**요청** `POST /v1/banking/transactions/import` (`multipart/form-data`, `Idempotency-Key` 권장)
```
file=@bank_2026-06.csv
bank_account_id=ba01...
```

**응답** `200 OK`
```json
{
  "data": {
    "import_batch_id": "ib77...",
    "imported_count": 142,
    "duplicate_skipped": 3,
    "auto_matched_count": 95,
    "unmatched_count": 47,
    "auto_match_rate": 0.6690
  },
  "meta": { "request_id": "9b2f..." }
}
```
> 업로드 시 기존 `transaction_matching_rules`(canon §2.31)를 우선순위(`priority`)대로 적용해 자동 분류. 중복은 `import_batch_id`+거래 키로 스킵.

### 10.5 예시 — 자동 추천 매칭

**응답** `GET /v1/banking/transactions/bt55.../suggestions`
```json
{
  "data": {
    "transaction": {
      "id": "bt55...", "txn_date": "2026-06-13", "amount": 350000,
      "direction": "deposit", "counterparty_name": "김지은",
      "is_matched": false, "match_target": null
    },
    "suggestions": [
      { "match_target": "revenue", "matched_ref_type": "payment", "matched_ref_id": "pm89...", "member_id": "8f31...", "member_name": "김지은", "confidence": 0.95, "reason": "amount+name+date 일치" }
    ]
  },
  "meta": { "request_id": "9b2f..." }
}
```
> 입금자명(`counterparty_name`) ↔ 회원명(`members.name`) + 금액 + 날짜 기준 추천(canon §2.28, 원본 §9 MVP).

### 10.6 예시 — 수동 매칭·분류

**요청** `POST /v1/banking/transactions/bt55.../match`
```json
{
  "match_target": "revenue",
  "matched_ref_type": "payment",
  "matched_ref_id": "pm89...",
  "create_rule": false
}
```

**응답** `200 OK`
```json
{
  "data": {
    "transaction": { "id": "bt55...", "is_matched": true, "match_target": "revenue", "matched_ref_type": "payment", "matched_ref_id": "pm89..." },
    "reconciliation_log": { "id": "rl01...", "txn_type": "bank", "txn_id": "bt55...", "action": "manual_matched", "staff_id": "5d2e...", "processed_at": "2026-06-13T02:00:00Z" }
  },
  "meta": { "request_id": "9b2f..." }
}
```

### 10.7 예시 — 분류 규칙 추가(다음 거래부터 자동 적용)

> 원본 §7·§18: "관리자가 수정한 분류 규칙을 다음 거래부터 자동 적용".

**요청** `POST /v1/matching-rules`
```json
{
  "match_field": "vendor_name",
  "pattern": "스타벅스",
  "match_type": "contains",
  "target_match": "expense",
  "expense_category": "meal",
  "cost_type": "variable",
  "priority": 10,
  "is_active": true
}
```
> `target_match`(canon §3.19)·`expense_category`(canon §3.13)·`cost_type`(canon §3.14) enum 준수. 생성 후 **이전 거래는 소급 적용하지 않고 다음 업로드/거래부터** 적용한다(원본 §7). 규칙 추가/수정은 `audit_logs`·`transaction_reconciliation_logs`에 기록.

### 10.8 예시 — 카드매출 입금 대조(정산 3단계)

**요청** `POST /v1/cards/sales`
```json
{
  "payment_id": "pm88...",
  "approval_no": "30021455",
  "amount": 350000,
  "approved_at": "2026-06-12T05:00:00Z",
  "fee_amount": 8050,
  "reconciliation_stage": "approved"
}
```
> `net_deposit_amount = amount − fee_amount = 350000 − 8050 = 341950`(canon §2.29). `fee_amount`는 미지정 시 `amount × card_fee_rate`(canon §6.3, 기본 0.023)로 추정.

**정산 단계 갱신** `PATCH /v1/cards/sales/cs_sale01...`
```json
{ "reconciliation_stage": "deposited", "deposited_at": "2026-06-14T01:00:00Z", "bank_transaction_id": "bt60..." }
```
> `reconciliation_stage`(canon §3.21): `approved`(승인)→`captured`(매입)→`deposited`(입금). **미입금 카드매출** = Σ`net_deposit_amount` where `reconciliation_stage != deposited`(canon §4.4).

### 10.9 예시 — 비용 합계(고정비/변동비)

**응답** `GET /v1/expenses/summary?expense_date_from=2026-06-01&expense_date_to=2026-06-30`
```json
{
  "data": {
    "total_amount": 9850000,
    "by_cost_type": { "fixed": 5400000, "variable": 4450000 },
    "by_category": {
      "rent": 2200000, "payroll": 2400000, "instructor_fee": 1800000,
      "advertising": 1200000, "payment_fee": 320000, "utilities": 180000,
      "supplies": 250000, "etc": 1300000
    }
  },
  "meta": { "request_id": "9b2f..." }
}
```
> 산식(canon §4.4): 총비용 = Σ`expense_records.amount`. 고정비/변동비 = `cost_type`별 합(canon §3.14).

---

## 11. 대시보드 API (dashboard: admin / profit)

> 원본 §13(관리자 4영역)·§8(수익분석 지표). 지표 산식은 canon §4.4 + [`19-metrics.md`]. UI는 [`09-admin-dashboard.md`]·[`10-profit-dashboard.md`]. 모든 금액 정수(원).

### 11.1 엔드포인트

| 메서드 | 경로 | 설명 | 권한 | 단계 |
|---|---|---|---|---|
| GET | `/dashboard/admin` | 관리자 4영역(오늘운영/매출/비용/수익) | owner(all)·manager(요약)·accountant | MVP |
| GET | `/dashboard/profit` | 수익분석(결제/소진 기준 토글·예측) | owner·accountant | MVP(예측 2차) |
| GET | `/dashboard/profit/by-instructor` | 강사별 수익성 | owner·accountant | 2차 |
| GET | `/dashboard/profit/by-source` | 유입경로별 수익성·전환율 | owner·accountant | 2차 |

### 11.2 예시 — 관리자 대시보드

**요청** `GET /v1/dashboard/admin?date=2026-06-12`

**응답** `200 OK`
```json
{
  "data": {
    "today_operation": {
      "today_session_count": 9,
      "today_reserved_count": 38,
      "available_seat_count": 7,
      "trial_reserved_count": 3,
      "new_inquiry_count": 2,
      "no_show_risk_member_count": 4,
      "expiring_member_count": 6,
      "receivable_member_count": 3
    },
    "month_revenue": {
      "revenue_basis": "payment",
      "gross_revenue_amount": 18400000,
      "refund_amount": -1260000,
      "net_revenue_amount": 17140000,
      "personal_amount": 8200000, "group_amount": 6300000,
      "trial_amount": 0, "etc_amount": 2640000,
      "new_member_amount": 6300000, "re_enroll_amount": 4200000
    },
    "month_expense": {
      "total_amount": 9850000,
      "fixed_amount": 5400000, "variable_amount": 4450000,
      "advertising_amount": 1200000, "instructor_fee_amount": 1800000,
      "payment_fee_amount": 320000, "rent_amount": 2200000,
      "supplies_amount": 250000, "utilities_amount": 180000, "etc_amount": 1300000
    },
    "month_profit": {
      "operating_profit_amount": 7290000,
      "operating_profit_rate": 0.4253,
      "bank_balance_amount": 14200000,
      "undeposited_card_sales_amount": 683900,
      "receivable_amount": 150000,
      "expected_expense_amount": 1100000,
      "month_end_expected_profit_amount": 6190000
    }
  },
  "meta": { "request_id": "9b2f..." }
}
```
> 산식(canon §4.4): 영업이익 = 순매출 − 총비용 = 17,140,000 − 9,850,000 = 7,290,000. 영업이익률 = 7,290,000 ÷ 17,140,000 = 0.4253. 미입금 카드매출 = Σ`net_deposit_amount`(`reconciliation_stage != deposited`). 미수금 = Σ`receivable_amount`(`payment_status in receivable,partial`).

### 11.3 예시 — 수익분석 대시보드(기준 토글)

**요청** `GET /v1/dashboard/profit?revenue_basis=consumption&month=2026-06`

**응답** `200 OK`
```json
{
  "data": {
    "revenue_basis": "consumption",
    "net_revenue_amount": 15800000,
    "total_expense_amount": 9850000,
    "fixed_amount": 5400000, "variable_amount": 4450000,
    "operating_profit_amount": 5950000,
    "operating_profit_rate": 0.3766,
    "personal_profitability": { "revenue_amount": 8200000, "instructor_fee_amount": 1100000, "margin_amount": 7100000 },
    "group_profitability": { "revenue_amount": 6300000, "instructor_fee_amount": 700000, "margin_amount": 5600000 },
    "avg_revenue_per_member_amount": 142000,
    "avg_profit_per_member_amount": 53000,
    "new_member_cac_amount": 95000,
    "member_ltv_amount": 980000,
    "re_enroll_rate": 0.62,
    "trial_conversion_rate": 0.48,
    "forecast": {
      "month_end_expected_revenue_amount": 19200000,
      "month_end_expected_profit_amount": 6190000,
      "month_end_expected_cash_amount": 15300000
    }
  },
  "meta": { "request_id": "9b2f..." }
}
```
> `revenue_basis` 토글로 결제기준↔소진기준 전환(canon §3.12·§4). 결제기준은 현금흐름, 소진기준은 원가·수익성에 유리(canon §4.3). 두 기준 합산 금지. `forecast`는 2차 기능(원본 §17). CAC/LTV/전환율 정의는 [`19-metrics.md`].

---

## 12. 강사·정산 API (staff / settlements / instructor-comments / exercise-logs)

> canon §2(8 `staff`, 26 `settlements`, 35 `instructor_comments`, 36 `exercise_logs`). enum `role`(§3.18). 강사는 전체 매출·통장 잔액 접근 불가(canon §5).

### 12.1 엔드포인트

| 메서드 | 경로 | 설명 | 권한 | 단계 |
|---|---|---|---|---|
| GET | `/staff` | 직원·강사 목록 | owner·manager·accountant | MVP |
| POST | `/staff` | 직원·강사 등록 | owner·manager | MVP |
| GET | `/staff/{id}` | 강사 프로필·근무시간 | owner·manager·accountant·self | MVP |
| PATCH | `/staff/{id}` | 프로필·근무·정산방식 수정 | owner·manager | MVP |
| GET | `/staff/{id}/performance` | 예약률/출석률/노쇼율/매출/예상정산 | owner·accountant·self(요약) | 2차 |
| GET | `/settlements` | 정산 목록 | owner·accountant·instructor(본인) | 2차 |
| POST | `/settlements` | 기간 정산 집계 생성 | owner·accountant | 2차 |
| PATCH | `/settlements/{id}` | 정산 확정·지급 처리(draft→confirmed→paid) | owner·accountant | 2차 |
| GET | `/instructor-comments` | 회원별 강사 코멘트 | owner·manager·info_staff·instructor(assigned)·member(own) | 2차 |
| POST | `/instructor-comments` | 코멘트 작성 | owner·instructor(assigned) | 2차 |
| GET | `/exercise-logs` | 운동일지 목록 | owner·instructor(assigned)·member(own) | 2차 |
| POST | `/exercise-logs` | 운동일지 작성 | owner·instructor(assigned) | 2차 |

### 12.2 예시 — 강사 성과

**응답** `GET /v1/staff/5d2e.../performance?month=2026-06`
```json
{
  "data": {
    "staff_id": "5d2e...",
    "session_count": 210,
    "booking_rate": 0.88, "attendance_rate": 0.91, "no_show_rate": 0.06,
    "re_enroll_contribution_count": 14,
    "revenue_amount": 8550000,
    "expected_settlement_amount": 1710000
  },
  "meta": { "request_id": "9b2f..." }
}
```
> 강사 본인은 요약만 조회(canon §5: `instructor`는 `assigned 매출만`). `session_count`는 출석 기준 수업 수(canon §2.26·원본 §12).

### 12.3 예시 — 정산 확정

**요청** `PATCH /v1/settlements/st01...`
```json
{ "status": "confirmed" }
```
> `status` 전이: `draft`→`confirmed`→`paid`(canon §2.26). 확정·지급은 `audit_logs`에 기록. `total_amount = base_amount + bonus_amount − deduction_amount`.

---

## 13. 알림 API (notifications / notification-templates)

> canon §2(33 `notification_templates`, 34 `notifications`). enum `notification_type`(§3.20, 13종). 정책 canon §6.4.

### 13.1 엔드포인트

| 메서드 | 경로 | 설명 | 권한 | 단계 |
|---|---|---|---|---|
| GET | `/notification-templates` | 템플릿 목록(13종) | owner·manager | MVP |
| PATCH | `/notification-templates/{id}` | 템플릿 본문·채널·활성 수정 | owner·manager | MVP |
| GET | `/notifications` | 알림 발송/예약 이력 | owner·manager·info_staff·member(own) | MVP |
| POST | `/notifications` | 수동 발송/예약 생성 | owner·manager·info_staff | MVP |
| POST | `/notifications/{id}/cancel` | 예약 알림 취소 | owner·manager·info_staff | MVP |

**필터(GET /notifications)**: `notification_type`, `status`(scheduled/sent/failed/canceled), `channel`, `member_id`, `scheduled_at_from`/`_to`. **정렬**: `scheduled_at`.

### 13.2 예시 — 수동 알림 예약

**요청** `POST /v1/notifications`
```json
{
  "member_id": "8f31...",
  "notification_type": "pass_expiring",
  "channel": "sms",
  "scheduled_at": "2026-09-03T00:00:00Z",
  "payload_json": { "member_name": "김지은", "expire_date": "2026-09-10", "remaining_count": 2 }
}
```
> `notification_type`(canon §3.20)·`channel`(sms/kakao/push/email, canon §2.33) enum 준수. 채널 기본값은 스튜디오 정책 `default_channel`(canon §6.4: `sms`, 2차 `kakao`). 예약/리마인드 등 자동 알림은 서버 스케줄러가 정책(canon §6.4 `reminder_before_minutes`·`long_absence_days`)에 따라 자동 생성한다.

**응답** `201 Created`
```json
{
  "data": {
    "id": "nt01...", "member_id": "8f31...",
    "template_id": "tpl_pass_expiring",
    "notification_type": "pass_expiring", "channel": "sms",
    "status": "scheduled", "scheduled_at": "2026-09-03T00:00:00Z",
    "sent_at": null, "error_message": null
  },
  "meta": { "request_id": "9b2f..." }
}
```

---

## 14. SaaS API (tenants / studios / subscriptions / integrations)

> canon §2(1 `tenants`, 2 `studios`, 41 `subscription_plans`, 42 `tenant_subscriptions`, 39 `external_integrations`, 40 `sync_logs`, 37 `financial_reports`, 38 `audit_logs`). 글로벌 리소스는 `saas_admin` 전용. 테넌트 내 설정은 `owner`(canon §5). 아키텍처 [`20-saas-architecture.md`].

### 14.1 엔드포인트

| 메서드 | 경로 | 설명 | 권한 | 단계 |
|---|---|---|---|---|
| GET | `/saas/tenants` | 전체 테넌트 목록 | saas_admin | 3차 |
| POST | `/saas/tenants` | 테넌트 생성(온보딩) | saas_admin | 3차 |
| PATCH | `/saas/tenants/{id}` | 테넌트 상태(active/suspended/closed) | saas_admin | 3차 |
| GET | `/studios` | 스튜디오 목록 | owner·manager, saas_admin | MVP |
| POST | `/studios` | 스튜디오 생성 | owner, saas_admin | MVP |
| PATCH | `/studios/{id}` | 스튜디오 설정·정책(`policy_json`) 수정 | owner | MVP |
| GET | `/studios/{id}/policy` | 정책 파라미터 조회(canon §6) | owner·manager | MVP |
| PATCH | `/studios/{id}/policy` | 정책 오버라이드 수정 | owner | MVP |
| GET | `/users` | 사용자 목록 | owner, saas_admin | MVP |
| POST | `/users` | 사용자 초대·생성(역할 부여) | owner, saas_admin | MVP |
| PATCH | `/users/{id}` | 역할·상태 수정 | owner, saas_admin | MVP |
| GET | `/saas/subscription-plans` | 요금제 목록 | saas_admin·owner(R) | 3차 |
| POST | `/saas/subscription-plans` | 요금제 생성 | saas_admin | 3차 |
| GET | `/saas/subscriptions` | 테넌트 구독 목록 | saas_admin | 3차 |
| POST | `/saas/subscriptions` | 구독 생성·변경 | saas_admin·owner | 3차 |
| GET | `/integrations` | 외부 연동 설정 목록 | owner·accountant | 2차 |
| POST | `/integrations` | 연동 추가(오픈뱅킹/PG/알림톡/카드조회) | owner | 2차 |
| GET | `/sync-logs` | 동기화 실행·실패 이력 | owner·accountant | 2차 |
| GET | `/financial-reports` | 재무/손익 리포트 스냅샷 목록 | owner·accountant | 2차 |
| POST | `/financial-reports/export` | 세무 공유용 리포트 내보내기 | owner·accountant | 3차 |
| GET | `/audit-logs` | 감사 로그 조회 | owner·accountant, saas_admin | MVP |

### 14.2 예시 — 스튜디오 정책 오버라이드

**요청** `PATCH /v1/studios/0c9f.../policy`
```json
{
  "booking_open_days": 7,
  "cancel_deadline_minutes": 180,
  "deduct_timing": "on_booking",
  "no_show_deduct": true,
  "max_hold_days": 45,
  "refund_penalty_rate": 0.10,
  "card_fee_rate": 0.023,
  "default_channel": "kakao"
}
```
> 키·기본값은 canon §6(예약 §6.1·수강권 §6.2·결제 §6.3·알림 §6.4)와 글자 단위 일치. 미지정 키는 시스템 기본값 유지. 변경은 `audit_logs`에 기록.

### 14.3 예시 — 사용자 초대(역할 부여)

**요청** `POST /v1/users`
```json
{
  "email": "account@studioA.kr",
  "phone": "010-1111-2222",
  "role": "accountant",
  "studio_ids": ["0c9f..."],
  "staff_id": null
}
```
> `role`은 canon §3.18 enum 7종만 허용. 초대 시 `status: "invited"`로 생성, 이메일 링크로 비밀번호 설정 후 `active`.

### 14.4 예시 — 감사 로그 조회

**응답** `GET /v1/audit-logs?entity_type=refunds&action=refund&occurred_at_from=2026-06-01`
```json
{
  "data": [
    {
      "id": "al01...", "actor_user_id": "7a1c...", "actor_role": "owner",
      "entity_type": "refunds", "entity_id": "rf01...", "action": "refund",
      "before_json": null,
      "after_json": { "refund_amount": 252000, "restored_count": 8 },
      "ip_address": "203.0.113.7", "occurred_at": "2026-06-20T02:00:00Z"
    }
  ],
  "meta": { "request_id": "9b2f...", "page": 1, "size": 20, "total_count": 1 }
}
```
> `action`은 canon §2.38: `create`·`update`·`delete`·`refund`·`pass_adjust`·`match`·`login`·`export`. append-only(canon §2.38), 수정/삭제 불가.

---

## 15. 단계별 엔드포인트 요약 (MVP / 2차 / 3차)

> 원본 §17 우선순위 기준. 단계 표기는 각 섹션 표의 **단계** 열과 일치.

### 15.1 MVP 엔드포인트(핵심)

| 도메인 | 대표 엔드포인트 |
|---|---|
| 인증/권한 | `/auth/*`, `/roles`, `/permissions`(R) |
| 회원/CRM | `/members*`, `/leads*`, `/leads/summary`, `/leads/conversion`, `/counseling-logs`, `/marketing-sources`(R) |
| 수업/예약 | `/rooms`, `/class-templates*`, `/class-sessions*`, `/reservations*`, `/waitlists*`, `/attendance*` |
| 수강권/결제 | `/products*`, `/passes*`, `/pass…/transactions`, `/purchases*`, `/payments*`, `/refunds*`, `/payments/receivables` |
| 매출 | `/revenue-records`, `/revenue-records/summary` |
| 비용/거래 | `/expenses*`, `/expense-categories`(R), `/banking/transactions/import`+`/match`+`/suggestions`, `/cards/expenses/import`+`/match`, `/cards/sales`, `/matching-rules*`, `/reconciliation-logs` |
| 대시보드 | `/dashboard/admin`, `/dashboard/profit`(예측 제외) |
| 알림 | `/notifications*`, `/notification-templates` |
| 운영/SaaS | `/studios*`, `/studios/{id}/policy`, `/users*`, `/audit-logs`, `/staff*` |

### 15.2 2차 엔드포인트

- 매출 분해: `/revenue-records/breakdown`, `/dashboard/profit/by-instructor`, `/dashboard/profit/by-source`
- 예측: `/dashboard/profit` `forecast` 블록(월말 예상 손익)
- 정산/강사: `/settlements*`, `/staff/{id}/performance`
- 운동일지/코멘트: `/instructor-comments*`, `/exercise-logs*`
- 자동화/연동: `/integrations*`, `/sync-logs`, `/financial-reports`, `/matching-rules`(자동 적용 고도화), `/expense-categories`(C), `/permissions`(PATCH)

### 15.3 3차 엔드포인트

- 금융 자동연동: `/banking/accounts/sync`, `/cards/sales/sync`(오픈뱅킹·카드매출 통합조회)
- 온라인 결제: `/payments`의 `online`(PG) 수단, `payment_provider`·`external_payment_id` 활성화
- SaaS 과금: `/saas/tenants*`, `/saas/subscription-plans*`, `/saas/subscriptions*`
- 세무: `/financial-reports/export`(세무사 공유)

---

## 16. 공통 헤더·상태코드 요약 (Quick Reference)

| 헤더 | 방향 | 용도 |
|---|---|---|
| `Authorization: Bearer <token>` | 요청 | 인증(§1.2) |
| `X-Studio-Id` | 요청 | 테넌시 스코프(§1.3) |
| `X-Tenant-Id` | 요청 | saas_admin 테넌트 지정(§1.3) |
| `Idempotency-Key` | 요청 | 멱등성(§1.8) |
| `If-Match` | 요청 | 낙관적 락(§1.9) |
| `X-Request-Id` | 요청/응답 | 추적 echo(§1.3·§1.7) |
| `Location` | 응답 | 201 생성 리소스 URI(§1.7) |
| `Retry-After` | 응답 | 429 재시도 대기(§1.13) |
| `X-RateLimit-Remaining` | 응답 | 잔여 호출 수(§1.13) |

| 코드 | 의미 | 비고 |
|---|---|---|
| 200 | OK | 조회·수정·취소 성공 |
| 201 | Created | 생성 성공(+`Location`) |
| 400/401/403/404 | 요청/인증/권한/부재 | §1.10 |
| 409/422/429 | 충돌/검증/한도 | §1.10 |
| 500 | 서버 오류 | §1.10 |

---

## 관련 문서

- [`00-canon.md`](./00-canon.md) — 단일 진실원천(스키마·enum·RBAC·회계모델·정책 기본값). 본 문서의 모든 필드·enum·권한의 근거.
- [`11-erd.md`](./11-erd.md) — 데이터베이스 ERD 초안(테이블 상세 컬럼·인덱스·제약). 본 API 페이로드 필드의 출처.
- [`13-rbac.md`](./13-rbac.md) — 권한 정책 상세 매트릭스(엔드포인트 권한 열의 근거).
- [`14-booking-policy.md`](./14-booking-policy.md) — 예약/취소/노쇼/차감 정책(§6 예약 API 동작 규칙).
- [`15-pass-policy.md`](./15-pass-policy.md) — 수강권 정책(§7 수강권 API 동작 규칙).
- [`16-payment-refund-policy.md`](./16-payment-refund-policy.md) — 결제/환불 정책(§8 결제·환불 산식).
- [`17-reconciliation-policy.md`](./17-reconciliation-policy.md) — 통장/카드 거래 매칭 정책(§10 매칭 API 규칙).
- [`18-expense-category-policy.md`](./18-expense-category-policy.md) — 비용 카테고리 정책(§10 비용 분류 규칙).
- [`19-metrics.md`](./19-metrics.md) — 수익분석 지표 정의(§9·§11 산식·CAC/LTV/전환율).
- [`09-admin-dashboard.md`](./09-admin-dashboard.md) · [`10-profit-dashboard.md`](./10-profit-dashboard.md) — 대시보드 화면 설계(§11 응답의 UI 매핑).
- [`20-saas-architecture.md`](./20-saas-architecture.md) — SaaS 확장 아키텍처(§14 테넌시·구독 API).
