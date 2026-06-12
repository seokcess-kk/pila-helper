# 필라헬퍼 (Pila-Helper) — 필라테스 경영관리 SaaS

> **예약·회원권·출석·상담CRM·매출·비용·수익분석 통합 경영관리 솔루션**
> 신규 필라테스 샵의 내부 운영용으로 시작해, 여러 샵이 쓰는 **멀티테넌트 SaaS**로 확장한다.

## 한 줄 정의

> "예약·회원권·출석은 기본으로 끝내고, **통장·카드 내역을 자동으로 엮어** 원장이
> **'이번 달 진짜 얼마 남았는지'를 10초 안에 보는** 필라테스 경영관리 비서"

## 핵심 차별화

기존 솔루션(스튜디오메이트·바디코디·아하루)은 예약·회원·수업 관리에 강하지만,
**"실제로 번 돈 vs. 쓴 돈"** 과 **수익성 분석**까지는 깊게 다루지 않는다. 필라헬퍼의 두 축:

- **이중기준 손익** — **결제기준**(돈 들어온 날)과 **수업 소진기준**(수업 쓴 날)을 분리 인식.
  현금흐름은 결제기준으로, 강사·수업·유입경로별 수익성은 소진기준으로 본다. → [`docs/spec/19-metrics.md`](docs/spec/19-metrics.md)
- **통장/카드 자동 매칭** — 사업자 통장·카드 CSV를 올리면 입금자명·금액·날짜로 회원 결제와
  자동 매칭하고, 한 번 고친 거래처 분류는 다음부터 자동 적용. → [`docs/spec/17-reconciliation-policy.md`](docs/spec/17-reconciliation-policy.md)

---

## 📐 설계 정본 — `docs/spec/` (v2, 2026-06-12)

전면 재설계된 **SaaS 경영관리 솔루션 설계서**. 단일 진실원천(`00-canon.md`)을 기준으로
23개 산출물이 글자 단위로 정합한다. **시작점: [`docs/spec/00-index.md`](docs/spec/00-index.md)**

| # | 산출물 | 파일 |
|---|--------|------|
| — | **단일 진실원천**(스키마·enum·회계모델·RBAC) | [`00-canon.md`](docs/spec/00-canon.md) |
| — | 마스터 인덱스 / 읽는 순서 | [`00-index.md`](docs/spec/00-index.md) |
| 1–3 | 서비스 개요 · 페르소나 · 시나리오 | [`01`](docs/spec/01-overview.md) [`02`](docs/spec/02-personas.md) [`03`](docs/spec/03-scenarios.md) |
| 4–6 | 전체 기능 목록 · MVP 범위 · 2·3차 확장 | [`04`](docs/spec/04-feature-catalog.md) [`05`](docs/spec/05-scope-mvp.md) [`06`](docs/spec/06-scope-phases.md) |
| 7–8 | 화면 IA · 와이어프레임 | [`07`](docs/spec/07-ia.md) [`08`](docs/spec/08-wireframes.md) |
| 9–10 | 관리자 대시보드 · **수익분석 대시보드** | [`09`](docs/spec/09-admin-dashboard.md) [`10`](docs/spec/10-profit-dashboard.md) |
| 11–12 | **데이터 ERD**(42 테이블) · API 명세 | [`11`](docs/spec/11-erd.md) [`12`](docs/spec/12-api.md) |
| 13 | 권한 정책(RBAC) | [`13`](docs/spec/13-rbac.md) |
| 14–16 | 예약/차감 · 수강권 · 결제/환불 정책 | [`14`](docs/spec/14-booking-policy.md) [`15`](docs/spec/15-pass-policy.md) [`16`](docs/spec/16-payment-refund-policy.md) |
| 17–19 | **통장/카드 매칭** · 비용 카테고리 · **수익지표 정의** | [`17`](docs/spec/17-reconciliation-policy.md) [`18`](docs/spec/18-expense-category-policy.md) [`19`](docs/spec/19-metrics.md) |
| 20 | SaaS 확장 아키텍처 | [`20`](docs/spec/20-saas-architecture.md) |
| 21–23 | 개발 우선순위 · QA 체크리스트 · 운영 리스크 | [`21`](docs/spec/21-roadmap.md) [`22`](docs/spec/22-qa-checklist.md) [`23`](docs/spec/23-risks.md) |

> 원본 요구사항 정본: [`docs/spec/_source-requirements.md`](docs/spec/_source-requirements.md)

### 확정된 방향 (v2)

- **타겟**: 신규 필라테스 샵(1:1 개인 + 그룹레슨, 횟수권 중심) → 멀티테넌트 SaaS
- **클라이언트**: **관리자 웹 + 회원 모바일 웹**(회원앱·키오스크·출입제어는 확장)
- **결제**: 현장 카드 + 무통장입금/계좌이체 수기 기록(온라인 결제/PG는 2·3차)
- **데이터**: MVP부터 `tenant_id`/`studio_id` 격리 + 금융연동 확장 테이블 + `audit_logs` 내장
- **수익분석**: 핵심 차별화 — 결제기준/소진기준 이중 손익 + 통장/카드 자동 매칭

---

## 🧪 v2 MVP 구현 — 동작·테스트 완료 (외부 계정 불필요)

v2 설계(`docs/spec/`)를 토대로 **동작하는 MVP 슬라이스**를 구현했다(인메모리 저장소, 즉시 실행).
멀티테넌트 기반 + 회원·상담CRM·수업·예약·출결·수강권·결제·환불·미수·**이중기준 손익**·비용·**통장/카드 매칭**·
관리자/수익분석 대시보드·RBAC·감사로그. 상세: [`docs/spec/24-implementation.md`](docs/spec/24-implementation.md).

```bash
npm install
npm test            # v2 유닛 45 (규칙·통합·RBAC) GREEN
npm run dev         # http://localhost:3000 (인메모리 시드)
npm run build && npx next start -p 3100   # 프로덕션 기동
E2E_BASE=http://localhost:3100 npm run e2e   # HTTP 스모크 12 GREEN
npx playwright test                       # 브라우저 플로우 8 GREEN
```
> 코드는 `src/domain`(타입)·`src/rules`(규칙)·`src/biz`(서비스)·`src/data`(인메모리 DB+시드)·`app`(Next UI).
> 인메모리 저장소(`src/data/db.ts`)를 Prisma/Postgres로 교체하면 서비스 인터페이스 그대로 프로덕션 전환.
> 자체 적대적 코드리뷰(29건 검토→27건 확정) 후 critical·high 전건 반영.

## 📦 레거시 v1 기획 문서 — `docs/`

v2 설계로 대체되었으나 의사결정 맥락·벤치마크·SMS PoC 자료로 보존.

| 문서 | 내용 |
|------|------|
| [docs/01-benchmark.md](docs/01-benchmark.md) | 경쟁 솔루션 벤치마크(아하루 도움말 40p 전수 분석 포함) |
| [docs/02-feature-spec.md](docs/02-feature-spec.md) ~ [docs/12-implementation.md](docs/12-implementation.md) | v1 기능명세·재무리포팅·데이터모델·와이어프레임·백로그·기술스택·SMS PoC·구현현황 |

## 진행 상태

- [x] v1: 벤치마크·기획·데이터모델·MVP 코드 + 테스트 (→ 레거시 `docs/`)
- [x] **v2 전면 재설계: 23개 산출물 + 단일 진실원천 + 교차검증** → [`docs/spec/`](docs/spec/00-index.md)
- [x] **v2 MVP 구현 + 검증**: 도메인·규칙·13서비스·시드·Next UI(콘솔 9 + 회원앱 2) · 유닛 45 / 스모크 12 / 브라우저 8 GREEN · 자기비평 1회차 반영 → [`docs/spec/24-implementation.md`](docs/spec/24-implementation.md)
- [ ] 프로덕션화: Prisma/Postgres 마이그레이션 + 세션 인증(OTP) + 알림톡/SMS 연동
- [ ] 2·3차: 거래 자동분류 고도화·오픈뱅킹·카드매출 조회·PG·전자계약·SaaS 과금
