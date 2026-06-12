# 20-saas-architecture.md — SaaS 확장 아키텍처

> **목적**: 내부 샵 1곳에서 시작해 외부 샵 다수를 수용하는 **멀티테넌트 SaaS**로 안전하게 확장하기 위한 데이터 격리·요금제/기능 플래그·사용량 미터링·백업·금융연동 계정·SaaS 최고관리자 콘솔·보안·배포 전략을 **글자 단위로 실행 가능한 설계**로 확정한다. 이 문서는 [`00-canon.md`](./00-canon.md) §1.2(공통 컬럼)·§2-A(테넌시 코어)·§2-J(SaaS 과금)·§3.18(역할)·§5(RBAC)를 **상세화·시각화**할 뿐 테이블·enum·정책 정의를 바꾸지 않는다. 충돌 시 canon이 우선한다.

근거: [`_source-requirements.md`](./_source-requirements.md) §15(SaaS 확장 구조)·§16(`tenants`/`studios`/`subscription_plans`/`tenant_subscriptions`)·§17(MVP 우선순위, 3차)·§18(보안·권한 분리 최우선) / [`00-canon.md`](./00-canon.md) §1.2·§2·§3.18·§5·§6.

본 문서는 새 테이블·새 enum·새 정책 파라미터를 **정의하지 않는다**. 모든 테이블명·컬럼명·enum 값·역할명은 canon의 단일 진실원천을 글자 단위로 인용한다.

---

## 0. 한눈에 보기 — 테넌시 모델 요약

| 개념 | 우리 솔루션의 정의 | 대표 테이블/컬럼 |
|---|---|---|
| **테넌트(tenant)** | SaaS **계약 단위** = 보통 한 브랜드/사업자(사업자번호 1개) | `tenants`(`id`, `business_no`, `owner_user_id`, ◆`status`) |
| **스튜디오(studio)** | 테넌트 하위 **물리 지점(샵)** = 데이터 분리 2차 키 | `studios`(`id`, `tenant_id`, `timezone`, `policy_json`) |
| **격리 키** | 모든 업무 테이블의 `tenant_id` + `studio_id` (canon §1.2 공통 컬럼) | 모든 데이터 테이블 |
| **구독(subscription)** | 테넌트가 가입한 요금제 계약 | `tenant_subscriptions` → `subscription_plans` |
| **글로벌 사용자** | 테넌트를 초월하는 SaaS 운영자 | `users.role = saas_admin`, `users.tenant_id = NULL` |

> **핵심 설계 원칙**: MVP 단계의 우리 샵도 **이미 테넌트 1개 + 스튜디오 1개**로 동작한다(원본 §15·§16, canon §2-A). 외부 샵 온보딩은 "새 구조를 만드는 일"이 아니라 **새 `tenants` 행 + `studios` 행 + `tenant_subscriptions` 행을 추가하는 일**이다. 코드/스키마 변경 없이 데이터만 늘어난다.

---

## 1. 멀티테넌트 데이터 모델 (tenants ↔ studios)

### 1.1 계층 구조

```
tenants (계약 단위 = 브랜드/사업자, 글로벌 테이블)
   │  1
   │
   │  N
   ├── studios (물리 지점, tenant_id 보유)
   │      │  1
   │      │  N
   │      └── 모든 업무 데이터 (members / class_sessions / payments / revenue_records / expense_records …)
   │              · tenant_id  (1차 격리 키)
   │              · studio_id  (2차 격리 키)
   │
   └── tenant_subscriptions (구독 계약, tenant_id 보유) ──→ subscription_plans (글로벌 요금제)

users (인증 주체, 글로벌 인증 테이블)
   · tenant_id  : NULL 이면 saas_admin(글로벌), 그 외는 특정 테넌트 소속
   · member_id / staff_id 로 members / staff 와 연결
```

- **`tenants`** — canon §2-A-1. SaaS 계약 1개 = 행 1개. `business_no`(사업자번호)·`owner_user_id`→`users`·◆`status`(active/suspended/closed). **자기 자신이 `tenant_id`의 근원**인 글로벌 테이블(자기 격리 키를 안 가짐).
- **`studios`** — canon §2-A-2. 테넌트 하위 지점. `tenant_id`·`timezone`(기본 `Asia/Seoul`)·`address`·`phone`·◆`status`(active/inactive)·`policy_json`(canon §6 정책 파라미터 스튜디오별 오버라이드).
- **단일 샵 ↔ 다지점**: 테넌트 1개에 `studios` 행이 1개면 단일 샵, N개면 다지점 브랜드. 같은 테넌트의 지점끼리는 `tenant_id`를 공유하므로 **브랜드 단위 통합 리포트**(전 지점 합산)가 자연스럽게 가능하고, `studio_id` 필터로 **지점별 분리 리포트**도 가능하다.

### 1.2 격리 키가 데이터에 붙는 방식 (canon §1.2)

모든 업무 테이블은 canon §1.2 공통 컬럼을 **반드시** 포함한다.

| 컬럼 | 역할 | SaaS 격리에서의 의미 |
|---|---|---|
| `tenant_id` uuid → `tenants.id` | 1차 격리 키 | **모든 쿼리에 필수 필터**. 테넌트 간 데이터는 절대 섞이지 않음 |
| `studio_id` uuid → `studios.id` | 2차 격리 키 | 같은 테넌트 내 지점 분리. 비-saas 역할은 자기 `studio_id`로 한정(canon §5) |
| `created_by` uuid → `users.id` | 변경 주체 | 감사·테넌트 귀속 추적 |
| `deleted_at` | 소프트 삭제 | 물리 삭제 금지(금전·감사). 테넌트 해지 시에도 보존 후 만료 정책으로 처리(§6) |

**예외(글로벌/코드 테이블)** — canon §1.2 명시: `tenants`·`subscription_plans`는 글로벌 테이블로 `studio_id`를 갖지 않는다. `users`는 `tenant_id`가 nullable(saas_admin은 NULL). `roles`·`permissions`·`marketing_sources`·`expense_categories`는 코드/코드+데이터 테이블이다.

---

## 2. Row-Level 격리 전략 — 단일 DB + tenant 컬럼

### 2.1 채택 전략과 근거

원본 §15는 "`studio_id` 기반 데이터 분리"를 요구한다. 우리는 **단일 데이터베이스 + 테넌트 컬럼(shared-database, shared-schema) 전략**을 채택한다.

| 전략 | 격리 방식 | 장점 | 단점 | 채택 |
|---|---|---|---|---|
| **(A) 단일 DB + tenant 컬럼** | 모든 행에 `tenant_id`+`studio_id`, 쿼리 필터 + RLS | 운영 단순, 비용 최저, 브랜드 통합 리포트 쉬움, 마이그레이션 1회 | 격리 실수 시 누출 위험 → RLS로 보강 | **MVP~성장기 기본** |
| (B) DB당 스키마 분리 | 테넌트별 schema | 중간 격리, 백업 분리 용이 | 마이그레이션 N회, 커넥션 관리 복잡 | 대형 테넌트 옵션(§2.4) |
| (C) 테넌트당 DB 분리 | 물리 DB 분리 | 최강 격리, 규제 대응 | 비용·운영 폭증, 통합 분석 어려움 | 엔터프라이즈 단독계약 옵션 |

> **결정**: 기본 (A). 금전·개인정보가 핵심이므로 (A)의 누출 위험을 **PostgreSQL Row-Level Security(RLS) + 애플리케이션 강제 필터 + 자동 테스트**의 3중 방어로 막는다(§2.2~2.3). 특정 대형/규제 테넌트는 (B)/(C)로 **이주(migrate-out)**할 수 있는 경로를 §2.4에 둔다.

### 2.2 1차 방어 — 애플리케이션 레이어 강제 필터

모든 데이터 접근은 **테넌트 컨텍스트를 강제 주입**하는 단일 게이트웨이(리포지토리/ORM 스코프)를 통과한다. 어떤 쿼리도 `tenant_id` 필터 없이 실행되지 못하게 막는다.

```sql
-- 모든 업무 쿼리의 불변식(canon §5: 격리는 권한검사보다 먼저)
SELECT ...
FROM   reservations r
WHERE  r.tenant_id = :ctx_tenant_id      -- 1차 격리 키 (필수)
  AND  r.studio_id = ANY(:ctx_studio_ids) -- 2차: 사용자가 접근 가능한 지점
  AND  r.deleted_at IS NULL              -- 소프트 삭제 제외
  AND  ...;                              -- 그 외 업무 조건
```

- 요청 진입 시 인증 토큰에서 `tenant_id`·`studio_ids`·`role`을 추출해 **요청 스코프(request context)**에 고정한다. 비즈니스 코드는 이 컨텍스트를 우회할 수 없다.
- `saas_admin`(글로벌)만 컨텍스트의 `tenant_id`를 명시적으로 지정해 특정 테넌트를 조회할 수 있다(감사 대상, §5.4·canon §5 마지막 행).

### 2.3 2차 방어 — DB Row-Level Security (RLS)

애플리케이션 버그로 필터가 빠져도 DB가 막는다. 모든 업무 테이블에 RLS 정책을 건다.

```sql
-- 세션 변수로 현재 테넌트 주입 (커넥션마다 SET)
SET app.current_tenant_id = '...';

-- 테이블별 RLS 정책 예시 (payments)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_payments ON payments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

- 애플리케이션 DB 계정은 RLS를 우회할 권한(`BYPASSRLS`)을 **갖지 않는다**. 마이그레이션·운영 점검용 슈퍼유저만 별도 보관.
- `saas_admin` 콘솔은 RLS를 끄지 않고, **대상 테넌트의 `tenant_id`를 세션 변수에 명시 설정**한 뒤 조회한다(접근 자체가 `audit_logs`에 남음).

### 2.4 향후 분리 옵션 (migrate-out 경로)

모든 행이 `tenant_id`로 태깅돼 있으므로 분리가 기계적이다.

1. **스키마 분리(B)**: 대상 테넌트의 `tenant_id` 행들만 `WHERE tenant_id = :t`로 추출 → 신규 스키마로 복사 → 라우팅 테이블에서 해당 테넌트를 새 스키마로 지정. 글로벌 테이블(`tenants`/`subscription_plans`)은 공유 유지.
2. **DB 분리(C)**: 위와 동일하나 물리 DB로 이주. `external_integrations`·`bank_accounts` 등 금융 민감 테넌트에 우선 적용.
3. **라우팅**: `tenants` 글로벌 테이블에 `shard_key`(논리 샤드 식별, config_json/별도 라우팅 레이어)로 어느 DB/스키마에 사는지 관리. 애플리케이션은 요청의 `tenant_id`로 커넥션을 선택.

> 분리는 **성능·규제·대형 계약** 트리거에서만 수행(§8 확장성). 대부분 테넌트는 (A)에 남는다.

---

## 3. 요금제 · 기능 플래그 · 한도 (subscription_plans / tenant_subscriptions)

### 3.1 구독 도메인 모델 (canon §2-J)

```
subscription_plans (글로벌 요금제 카탈로그)
   · code · name · ★price_amount · billing_cycle(monthly/yearly)
   · feature_limits_json (스튜디오 수 / 알림 발송량 / 금융연동 / 기능 플래그)
   · is_active◆
        │  1
        │  N
tenant_subscriptions (테넌트별 구독 계약)
   · tenant_id → tenants
   · subscription_plan_id → subscription_plans
   · ◆status(trial/active/past_due/canceled/suspended)
   · started_at · current_period_end_at · next_billing_at
   · ★amount · usage_json (사용량 기반 과금 누적)
```

- **`subscription_plans`** — canon §2-J-41. 글로벌 카탈로그. 금액은 정수(원), `billing_cycle`은 `monthly`/`yearly`. 기능 제한은 `feature_limits_json`에 담는다.
- **`tenant_subscriptions`** — canon §2-J-42. 테넌트 1개당 활성 구독 1개 기준. ◆`status`는 canon 정의값 `trial`/`active`/`past_due`/`canceled`/`suspended`. `usage_json`에 미터링 누적치(§4)를 적재.

### 3.2 요금제 예시 (3 tier — 원본 §15: 샵별 요금제/기능 제한)

> 아래 금액·한도는 **설계 예시값**이며, 영업 정책으로 조정 가능. `feature_limits_json` 구조의 계약은 본 표가 소유.

| 항목 (`feature_limits_json` 키) | `solo`(소규모) | `pro`(성장) | `enterprise`(다지점) |
|---|---|---|---|
| `subscription_plans.code` | `solo` | `pro` | `enterprise` |
| `price_amount`(월, 원) | 49,000 | 99,000 | 협의(사용량 기반) |
| `billing_cycle` | monthly/yearly | monthly/yearly | yearly |
| `max_studios`(스튜디오 수) | 1 | 3 | 무제한(−1) |
| `max_active_members`(활성 회원) | 200 | 1,000 | 무제한(−1) |
| `max_staff`(직원·강사) | 5 | 20 | 무제한(−1) |
| `notification_quota_monthly`(알림 발송) | 1,000 | 5,000 | 협의 |
| `feature_auto_reconcile`(자동 매칭 §17문서) | false | true | true |
| `feature_open_banking`(오픈뱅킹 §6문서) | false | false | true |
| `feature_pg_online`(온라인 결제 PG) | false | true | true |
| `feature_profit_dashboard`(수익분석 §10) | 요약만 | 전체 | 전체+브랜드통합 |
| `feature_tax_export`(세무 리포트 내보내기) | false | true | true |
| `data_retention_months`(데이터 보존) | 24 | 60 | 무제한 |
| `backup_frequency`(백업 주기) | daily | daily | daily+hourly PITR |

`feature_limits_json` 예시(`pro`):

```json
{
  "max_studios": 3,
  "max_active_members": 1000,
  "max_staff": 20,
  "notification_quota_monthly": 5000,
  "feature_flags": {
    "feature_auto_reconcile": true,
    "feature_open_banking": false,
    "feature_pg_online": true,
    "feature_profit_dashboard": "full",
    "feature_tax_export": true
  },
  "data_retention_months": 60,
  "backup_frequency": "daily"
}
```

### 3.3 기능 플래그 게이팅 (Feature Gating)

기능 진입 시 **테넌트의 활성 구독 → 요금제 `feature_limits_json` → 플래그**를 평가한다. RBAC(역할 권한, canon §5)과 **직교**한다: 권한이 있어도 요금제가 막으면 불가.

```
기능 사용 가능 =  RBAC 통과(역할이 해당 resource/action 권한 보유, canon §5)
              ∧  테넌트 활성 구독 존재(tenant_subscriptions.status ∈ {trial, active})
              ∧  요금제 feature_flags[해당기능] = true (또는 "full")
              ∧  사용량 한도 미초과(§4)
```

- 예) 강사가 자동매칭 화면을 호출 → 역할(`accountant`만 매칭 CRUD, canon §5)에서 이미 강사는 차단. `accountant`가 호출하면 RBAC 통과하나, `feature_auto_reconcile=false`인 `solo` 요금제면 **"플랜 업그레이드 필요"** 안내로 게이팅.
- 게이팅 결과(차단/허용)는 사용성 위해 화면에서 **업그레이드 유도 배너**로 노출하되, 차단된 API 호출 시 `403 plan_feature_disabled`로 응답(자세한 코드 체계는 [`12-api.md`](./12-api.md)).

### 3.4 구독 상태 전이 (`tenant_subscriptions.status`)

```
[가입]
  └─→ trial ──(체험기간 만료 + 결제 성공)──→ active
       │                                      │
       │(체험 만료 + 미결제)                   │(결제일 도래, 청구 실패)
       ▼                                      ▼
   canceled ◄──(고객 해지)── active ◄──→ past_due ──(재시도 실패 누적)──→ suspended
                                  ▲                                          │
                                  └──────(결제 정상화)─────────────────────────┘
```

| 상태(canon §2-J-42) | 의미 | 서비스 동작 |
|---|---|---|
| `trial` | 무료 체험 | 전 기능 사용(한도 내). 체험 종료일 = `current_period_end_at` |
| `active` | 정상 구독 | 요금제 한도 내 전 기능 |
| `past_due` | 결제 실패(유예) | 읽기/운영 유지, 신규 알림 발송·내보내기 등 일부 제한 + 결제 독촉 배너 |
| `suspended` | 정지 | 회원/예약 등 **읽기 전용**, 신규 쓰기 차단. 데이터는 보존(§6) |
| `canceled` | 해지 | 보존기간(`data_retention_months`) 후 만료 처리(§6) |

> 결제·청구 자체는 SaaS 과금 PG(별도 `external_integrations.provider='pg'` 또는 빌링 전용)와 연동. 테넌트 **고객(회원) 결제**(`payments`/canon §2-E)와 **SaaS 구독 결제**(`tenant_subscriptions`)는 **완전히 다른 도메인**이다 — 혼동 금지.

---

## 4. 사용량 미터링 (예약 · 알림 · 회원 수)

원본 §15: "샵별 … 알림 발송량 … 사용량 기반 과금 확장". 미터링은 (1) 한도 게이팅과 (2) 사용량 기반 과금의 공통 기반이다.

### 4.1 측정 지표와 출처 (모두 canon 테이블 집계 — 별도 카운터 테이블 불필요)

| 미터 키 | 정의 | 산식(출처 테이블) | 용도 |
|---|---|---|---|
| `active_members` | 활성 회원 수 | `count(members WHERE member_status ∈ {enrolled, re_enrolled} AND deleted_at IS NULL)` (canon §3.1) | 한도(`max_active_members`) |
| `staff_count` | 직원·강사 수 | `count(staff WHERE status='active')` (canon §2-B-8) | 한도(`max_staff`) |
| `studio_count` | 지점 수 | `count(studios WHERE status='active' AND tenant_id=:t)` | 한도(`max_studios`) |
| `reservations_monthly` | 월 예약 건수 | `count(reservations WHERE booked_at ∈ 당월)` (canon §2-C-14) | 사용량 과금(옵션) |
| `notifications_monthly` | 월 알림 발송 | `count(notifications WHERE status='sent' AND sent_at ∈ 당월)` (canon §2-H-34) | 한도(`notification_quota_monthly`) + 초과 과금 |
| `bank_txn_imported` | 거래 임포트 건수 | `count(bank_transactions ∪ card_expenses WHERE import_batch_id ∈ 당월)` | 사용량 과금(옵션) |
| `storage_bytes` | 증빙/리포트 저장량 | `sum(파일 크기)` (`expense_records.receipt_file_url`, `financial_reports.export_file_url`) | 저장 한도 |

### 4.2 누적 적재 — `tenant_subscriptions.usage_json`

미터는 **실시간 집계가 비싸지 않으면 조회 시 계산**(canon §1.3: 비율·집계는 저장 않고 계산)하되, 과금 정산용 월 스냅샷은 `tenant_subscriptions.usage_json`에 누적한다.

```json
// tenant_subscriptions.usage_json (현재 청구주기 누적)
{
  "period_start_at": "2026-06-01T00:00:00Z",
  "metered": {
    "active_members": 312,
    "staff_count": 8,
    "studio_count": 1,
    "reservations_monthly": 1840,
    "notifications_monthly": 4120,
    "storage_bytes": 734003200
  },
  "overage": {
    "notifications_over": 0,          // quota=5000 → 초과 0
    "notification_unit_price_amount": 15  // 초과 1건당 원
  }
}
```

### 4.3 한도 위반 처리 (Hard vs Soft limit)

| 미터 | 한도 종류 | 초과 시 동작 |
|---|---|---|
| `active_members`, `staff_count`, `studio_count` | **Soft(생성 차단형)** | 한도 도달 시 신규 **생성 API 차단**(`403 plan_limit_reached`) + 업그레이드 유도. 기존 데이터는 유지 |
| `notifications_monthly` | **Soft+과금** | 쿼터 초과분은 발송 계속하되 `overage.notifications_over`에 누적 → 다음 청구에 초과 과금(요금제가 허용 시). 미허용 요금제는 쿼터 도달 시 발송 보류 |
| `storage_bytes` | Soft(업로드 차단) | 초과 시 신규 업로드 차단 |

### 4.4 사용량 기반 과금 산식 (원본 §15)

```
이번 청구액
  = subscription_plans.price_amount               (기본 구독료)
  + max(0, notifications_monthly − notification_quota_monthly)
        × overage.notification_unit_price_amount  (알림 초과분)
  + (사용량 과금 옵션 미터들의 합)                  (예약/임포트 등, 요금제별)
```

- 예) `pro` 기본 99,000원, 당월 알림 5,400건(쿼터 5,000) → 초과 400건 × 15원 = 6,000원 → **청구 105,000원**.
- 산정 결과는 `tenant_subscriptions.amount`(이번 청구 확정액)에 기록하고, `next_billing_at`에 청구. 정산 스냅샷은 [`19-metrics.md`](./19-metrics.md) 산식 규약(금액 정수·원)을 준용.

---

## 5. SaaS 최고관리자 콘솔 (saas_admin)

원본 §15: "SaaS 관리자용 전체 대시보드 · 구독 결제 관리". 역할 `saas_admin`(canon §3.18, `tenant_id = NULL` 글로벌)만 접근.

### 5.1 콘솔 화면 구성 (테넌트 데이터와 물리적으로 분리된 운영 영역)

| 화면 | 내용 | 주요 데이터(canon) |
|---|---|---|
| **① 전체 대시보드** | 전체 테넌트 수·활성/정지/해지 분포, MRR(월 반복 매출), 신규/해지(Churn), 미수(과금) | `tenants.status`·`tenant_subscriptions`(status/amount) 집계 |
| **② 테넌트 목록** | 테넌트별 요금제·상태·지점 수·활성 회원·당월 알림 사용량·다음 청구일 | `tenants`×`tenant_subscriptions`×미터(§4) |
| **③ 테넌트 온보딩** | 신규 테넌트 생성 마법사(§7) | `tenants`/`studios`/`users`/`tenant_subscriptions` insert |
| **④ 구독/과금 관리** | 요금제 변경·체험 연장·청구 재시도·환불, 사용량/초과 과금 확인 | `subscription_plans`·`tenant_subscriptions`·`usage_json` |
| **⑤ 기능 플래그 관리** | 요금제 카탈로그·테넌트별 플래그 오버라이드 | `subscription_plans.feature_limits_json` |
| **⑥ 연동/동기화 상태** | 테넌트별 금융·알림 연동 상태·동기화 실패 모니터 | `external_integrations.status`·`sync_logs.status` |
| **⑦ 시스템 상태/감사** | 테넌트 접근 감사·시스템 헬스·백업 상태 | `audit_logs`(saas_admin 접근 포함) |

### 5.2 RBAC상 saas_admin (canon §5 준용)

canon §5 매트릭스의 `saas_admin` 열을 그대로 따른다. 요약:

| 리소스 | saas_admin 권한(canon §5) | 비고 |
|---|---|---|
| 테넌트/스튜디오 설정 | CRUD(all/global) | 온보딩·정지·해지 |
| 사용자/역할 | CRUD(global) | 테넌트 오너 계정 발급 |
| SaaS 과금/구독 | **CRUD** | 콘솔 전용(타 역할은 owner의 R(own)만) |
| 회원/리드·결제·매출·비용 | **R(global)** | 운영지원 목적의 **읽기 전용**. 쓰기 불가 |
| 감사로그 | R | 자신의 테넌트 접근도 기록됨 |

> **원칙**: saas_admin은 운영지원을 위해 **읽기**는 광범위하나, 테넌트의 **금전 데이터(결제/매출/비용/통장)를 수정하지 못한다**(canon §5). 모든 테넌트 데이터 열람은 `audit_logs`에 `action='login'/'export'`·`actor_role='saas_admin'`·대상 `tenant_id`로 기록(§9, canon §2-I-38).

### 5.3 MRR/Churn 산식 (콘솔 ① 대시보드)

```
MRR(월 반복 매출)
  = Σ tenant_subscriptions(status ∈ {active}).amount  (월환산: yearly는 ÷12)

신규 MRR     = 당월 신규 active 전환 테넌트의 amount 합
이탈(Churn) MRR = 당월 canceled/suspended 전환 테넌트의 직전 amount 합
순증 MRR     = 신규 MRR − 이탈 MRR
월 해지율(Churn rate) = 당월 이탈 테넌트 수 ÷ 전월말 active 테넌트 수
```

(SaaS 사업 자체의 손익이며, 테넌트 샵의 손익(`revenue_records`/`expense_records`, canon §4)과 **다른 장부**다.)

### 5.4 saas_admin 안전장치

- **데이터 접근 게이트**: saas_admin이 특정 테넌트 데이터를 열려면 콘솔에서 대상 테넌트를 명시 선택 → 세션 변수 `app.current_tenant_id` 설정(§2.3) → 모든 접근 감사. "전 테넌트 무필터 조회"는 집계용 read-only 뷰로만 허용.
- **2단계 인증(2FA) 필수** + 접근 IP 기록(`audit_logs.ip_address`).
- **쓰기 동작 최소화**: 콘솔의 테넌트 데이터 쓰기는 온보딩/구독 관리로 한정. 운영 데이터 수정 필요 시 테넌트 오너에게 위임.

---

## 6. 데이터 백업 · 보존 · 테넌트 비밀관리

### 6.1 백업 정책 (요금제 `backup_frequency` 연동, §3.2)

| 항목 | 정책 |
|---|---|
| 백업 주기 | 기본 **daily 전체 백업** + 트랜잭션 로그 기반 **PITR(시점 복구)** 보존(`enterprise`는 hourly 추가) |
| 보존 기간 | 백업 보존 30일 이상. 테넌트 **데이터 보존**은 요금제 `data_retention_months`(§3.2) |
| 격리 | 단일 DB 전략(§2)이므로 백업은 전체 단위. **테넌트 단위 추출 복원**은 `tenant_id` 필터 export로 제공(논리 백업) |
| 암호화 | 백업 저장소 암호화(at-rest) + 전송 암호화(in-transit) |
| 복구 테스트 | 분기 1회 복구 리허설(§22 QA 체크리스트 연계) |
| 테넌트 셀프 내보내기 | 오너가 자신의 데이터(CSV/JSON)·`financial_reports.export_file_url`(canon §2-I-37) 내보내기 가능 |

### 6.2 데이터 보존·삭제 (해지 라이프사이클)

```
tenant_subscriptions.status = canceled
   │
   │  (data_retention_months 동안 보존: 복구 가능, soft-delete 유지)
   ▼
보존기간 만료 → tenants.status = closed → 익명화/물리삭제 배치
   · audit_logs / payments / revenue_records 등 금전·감사 데이터는 법정 보존기간까지 별도 보존
   · 개인정보(members.name/phone 등)는 보존기간 후 익명화
```

- canon §1.2 원칙: 금전·감사 데이터는 **물리 삭제 금지(soft delete)**. 해지·재가입 시 데이터 연속성 보장.
- 법정 보존(전자상거래·세무: 거래·결제 기록)은 `data_retention_months`보다 길 수 있으므로 **금전 데이터는 별도 장기 보존 정책** 적용.

### 6.3 테넌트별 비밀관리 (금융연동 계정·시크릿)

원본 §15: "샵별 … 금융 연동 계정 … 관리자 권한". 금융·결제·알림 연동 자격증명은 **테넌트별로 분리·암호화 보관**한다.

| 테이블(canon) | 시크릿 보관 방식 |
|---|---|
| `external_integrations`(canon §2-I-39) | `credential_ref`에 **시크릿 자체가 아니라 참조 키(reference)**만 저장. 실제 자격증명은 외부 KMS/Secrets Manager 또는 봉인(seal)된 별도 저장소 |
| `bank_accounts`(canon §2-G-27) | `account_no_masked`(마스킹 저장). 평문 계좌·인증서는 시크릿 저장소 |
| SaaS 빌링 PG | SaaS 운영 시크릿(테넌트와 분리, 글로벌 영역) |

- **테넌트 격리 암호화**: 가능하면 테넌트별 데이터 암호화 키(envelope encryption)를 사용해, 한 테넌트의 키 노출이 타 테넌트로 번지지 않게 한다.
- 시크릿은 `audit_logs`·`sync_logs`·로그·API 응답에 **절대 평문 노출 금지**(원본 §18 보안 최우선). 연동 상태만 `external_integrations.status`(connected/disconnected/error)로 노출.
- 연동 자격증명 등록·해제는 테넌트 `owner`만(canon §5: 통장/카드/매칭 RU/CRUD는 owner·accountant). 동기화 이력은 `sync_logs`(canon §2-I-40).

---

## 7. 온보딩 경로 — 내부 샵 단일 테넌트 → 외부 샵 다수

### 7.1 단계 진화 (원본 §17: 3차 "외부 샵 온보딩")

| 단계 | 운영 형태 | 테넌트/스튜디오 상태 | 구독 |
|---|---|---|---|
| **MVP** | 우리 샵 1곳(내부) | `tenants` 1행 + `studios` 1행 | `trial`/내부 무과금 |
| **2차** | 우리 샵 1~소수 | 동일 테넌트, 지점 추가 가능 | `active`(내부) |
| **3차** | 외부 샵 다수(SaaS) | 테넌트 N행, 셀프 온보딩 | 요금제별 `active` |

> 핵심: **MVP의 우리 샵도 이미 테넌트 구조 위에서 동작**하므로(§0), 외부 샵 온보딩 시 코드 변경 없이 데이터만 추가된다. 이것이 원본 §15·§17의 "데이터 구조는 반드시 SaaS 확장 가능" 요구를 만족시키는 방식이다.

### 7.2 신규 테넌트 온보딩 절차 (saas_admin 콘솔 ③ 또는 셀프 가입)

```
1. tenants insert
     name, business_no, owner_user_id(아직 NULL), status='active'
2. users insert (오너 계정)
     email, tenant_id=新tenant, role='owner', status='invited'
   → tenants.owner_user_id 갱신
3. studios insert (1호점)
     tenant_id=新tenant, name, timezone='Asia/Seoul', policy_json=기본값(canon §6)
4. tenant_subscriptions insert
     tenant_id, subscription_plan_id(선택 요금제), status='trial',
     started_at, current_period_end_at(체험 종료), next_billing_at
5. 시드 데이터 자동 생성 (테넌트 격리하에)
     · roles/permissions 매핑 적용 (canon §2-A-4·5)
     · expense_categories 17종 기본값 시드 (canon §3.13)
     · marketing_sources 기본값 시드 (canon §3.16)
     · notification_templates 13종 기본값 시드 (canon §3.20)
6. 오너 초대 메일 발송 → owner 최초 로그인 → users.status='active'
7. 온보딩 체크리스트: 지점 정보·강사 등록·상품(수강권) 등록·결제수단 안내
```

- 모든 insert는 `created_by=saas_admin`(또는 셀프 가입 시스템) + `tenant_id` 태깅 + `audit_logs` 기록.
- 셀프 온보딩(3차)은 위 1~6을 **회원가입 플로우로 자동화**(결제수단 등록 → `trial` 시작). 콘솔 온보딩은 영업 지원형(수동 발급).

### 7.3 다지점 확장 (같은 테넌트에 스튜디오 추가)

```
studios insert (2호점)
  tenant_id = 기존 테넌트(동일)
  name='○○점 2호', timezone, policy_json=지점별 오버라이드
→ 요금제 max_studios 한도 확인(§4.3) → 초과 시 업그레이드 유도
→ 오너/매니저에게 2호점 studio_id 접근 부여(canon §5 스코프)
```

- 브랜드 통합 리포트는 `tenant_id` 기준 합산, 지점별은 `studio_id` 필터(§1.1). 수익분석([`10-profit-dashboard.md`](./10-profit-dashboard.md))은 두 뷰를 모두 지원.

---

## 8. 보안 · 확장성 · 배포 고려

### 8.1 보안 (원본 §18: 개인/금융/결제/매출/비용 정보는 보안·권한 분리 최우선)

| 영역 | 조치 |
|---|---|
| 테넌트 격리 | 3중 방어(앱 필터 + RLS + 자동 격리 테스트, §2.2~2.3). 누출은 P0 사고로 취급 |
| 인증/인가 | 토큰 기반, 요청 컨텍스트에 `tenant_id`/`role` 고정. RBAC는 canon §5·[`13-rbac.md`](./13-rbac.md) |
| 민감 필드 | 통장 잔액·매출 총액은 강사 접근 불가(canon §5: 통장 잔액 instructor=불가). 시크릿 평문 금지(§6.3) |
| 감사 | 모든 수정/삭제/환불/수강권 차감 + saas_admin의 테넌트 접근 → `audit_logs`(canon §2-I-38, append-only) |
| 전송/저장 암호화 | TLS(in-transit) + at-rest 암호화 + 테넌트별 envelope key(§6.3) |
| 개인정보 | 보존기간 후 익명화(§6.2). 내보내기·삭제 요청 대응 |

### 8.2 확장성 (Scalability)

| 축 | 전략 |
|---|---|
| **데이터** | `tenant_id`+`studio_id` 복합 인덱스를 모든 조회 기준 테이블에 선두 컬럼으로(예: `idx_reservations_session_status`도 tenant 스코프 전제). 대형 테넌트는 §2.4로 migrate-out |
| **읽기 부하** | 수익분석 집계는 무거우므로 읽기 복제본 + 일/월 마감 스냅샷(`financial_reports` canon §2-I-37) 활용. 비율·집계는 조회 시 계산(canon §1.3) |
| **쓰기 부하** | append-only 원장(`pass_transactions`·`revenue_records`·`audit_logs`)은 파티셔닝(예: `recognized_date`/`occurred_at` 월 파티션) 후보 |
| **알림/연동** | 외부연동(알림톡·오픈뱅킹·카드조회)은 비동기 작업 큐로 분리. 실패는 `sync_logs`(canon §2-I-40)에 적재·재시도 |
| **테넌트 폭증** | 라우팅 레이어(§2.4 `shard_key`)로 스키마/DB 샤딩. 글로벌 테이블만 공유 |

### 8.3 배포 (Deployment)

| 항목 | 전략 |
|---|---|
| 마이그레이션 | 단일 DB(§2) 전략 덕분에 스키마 마이그레이션 **1회로 전 테넌트 반영**. 무중단(expand-contract) 패턴 |
| 환경 분리 | dev / staging / prod 분리. staging은 prod 익명화 데이터로 격리 테스트 |
| 배포 안전 | 기능 플래그(§3.3)로 신기능을 특정 테넌트에만 점진 노출(카나리). 롤백은 플래그 off |
| 가용성 | 무중단 배포 + 헬스체크. 외부연동 장애는 코어 운영(예약/결제 기록)과 격리(circuit breaker) |
| 모니터링 | 테넌트별 에러율·지연·사용량(§4) 메트릭. saas_admin 콘솔 ⑥⑦에서 연동/시스템 상태 노출 |

### 8.4 테넌트 격리 자동 검증 (회귀 방지)

- **격리 테스트**: 테넌트 A 토큰으로 테넌트 B 리소스 접근 → 반드시 `404/403`. 모든 리소스 엔드포인트에 대해 자동화([`22-qa-checklist.md`](./22-qa-checklist.md) 연계).
- **RLS 무필터 가드**: 세션 변수 미설정 상태에서 쿼리 → 0행 반환(또는 거부) 확인.
- **요금제 게이팅 테스트**: 한도 초과·플래그 off 상태에서 생성/기능 호출 → `403 plan_limit_reached`/`plan_feature_disabled`.

---

## 9. 감사 · 컴플라이언스 연계 (canon §2-I-38)

- **테넌트 데이터 접근**: saas_admin의 모든 테넌트 데이터 조회/내보내기는 `audit_logs`에 `actor_role='saas_admin'`·`action ∈ {login, export, update}`·`entity_type`·대상 `tenant_id`·`ip_address`로 기록(append-only, `deleted_at` 미사용).
- **구독/과금 변경**: 요금제 변경·체험 연장·환불은 `audit_logs`에 기록(`entity_type='tenant_subscriptions'`).
- **시크릿 변경**: 금융연동 자격증명 등록/해제는 값은 남기지 않고 **변경 사실만**(`entity_type='external_integrations'`, before/after는 마스킹) 기록.
- 금전 원장(`payments`·`refunds`·`revenue_records`·`expense_records`·`pass_transactions`)은 테넌트 격리 + soft-delete + 감사로 무결성 보장(canon §1.2·§4).

---

## 10. 설계 점검 체크리스트 (요약)

| 점검 항목 | 상태 |
|---|---|
| 모든 업무 테이블에 `tenant_id`+`studio_id`(canon §1.2) | ✅ 필수 |
| 글로벌/코드 테이블 예외(`tenants`/`subscription_plans`/`users`/코드테이블) | ✅ 명시(§1.2) |
| RLS + 앱 필터 + 격리 테스트 3중 방어 | ✅ §2 |
| 요금제·기능 플래그·한도(`feature_limits_json`) 게이팅 | ✅ §3 |
| 사용량 미터링이 canon 테이블 집계로 산출(별도 카운터 불필요) | ✅ §4 |
| SaaS 결제 ↔ 테넌트 회원 결제 도메인 분리 | ✅ §3.1·§5.3 |
| saas_admin 금전 데이터 read-only + 감사 | ✅ §5.2·§9 |
| 테넌트별 시크릿 분리·암호화·평문 금지 | ✅ §6.3 |
| 단일 테넌트(MVP) → 외부 샵 온보딩 무코드 경로 | ✅ §7 |
| migrate-out(스키마/DB 분리) 향후 옵션 | ✅ §2.4·§8.2 |

---

## 관련 문서

- [`00-canon.md`](./00-canon.md) — 단일 진실원천(§1.2 공통 컬럼·§2-A 테넌시·§2-J 과금·§3.18 역할·§5 RBAC·§6 정책)
- [`_source-requirements.md`](./_source-requirements.md) — 정본 소스(§15 SaaS 확장·§16 테이블·§17 3차·§18 보안)
- [`06-scope-phases.md`](./06-scope-phases.md) — 2차/3차 확장 범위(SaaS 상품화 단계 전환 기준)
- [`13-rbac.md`](./13-rbac.md) — 권한 정책(saas_admin 포함 역할별 상세 매트릭스·테넌트 격리)
- [`10-profit-dashboard.md`](./10-profit-dashboard.md) — 수익분석 대시보드(브랜드 통합·지점별 뷰)
- [`12-api.md`](./12-api.md) — API 명세(요금제 게이팅 응답코드·테넌트 컨텍스트)
- [`19-metrics.md`](./19-metrics.md) — 수익분석 지표 정의(금액·집계 산식 규약)
- [`21-roadmap.md`](./21-roadmap.md) — 개발 우선순위(SaaS 상품화 일정)
- [`22-qa-checklist.md`](./22-qa-checklist.md) — QA 체크리스트(테넌트 격리·게이팅 검증)
- [`23-risks.md`](./23-risks.md) — 운영 리스크(데이터 누출·금융연동·격리 사고 대응)
