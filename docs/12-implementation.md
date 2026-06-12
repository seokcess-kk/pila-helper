# 12. 구현 현황 · 코드 리뷰 (실제 코드)

> 기획(01~11)을 실제 코드로 구현. **코어 도메인 + 서비스 + Next.js UI**를 짓고,
> 단위·통합·E2E(HTTP)·Playwright(브라우저) 4계층 테스트로 검증했다.

## 1. 검증 요약 (모두 GREEN)

| 계층 | 도구 | 수 | 무엇을 보장 |
|------|------|----|-------------|
| 단위 | vitest | 39 | §6 규칙(자격검증·차감·선택·현금주의·동시성)·파서 정확성 |
| 통합 | vitest | 8 | 회원→수강권→예약→출석→손익→SMS인입 **기능 연결** |
| E2E(HTTP) | vitest | 9 | 10개 라우트 런타임 200 + 핵심 데이터 렌더 |
| E2E(브라우저) | Playwright | 6 | 클릭→서버액션→규칙→재렌더 **UI 연결** |
| 타입 | tsc | 0 err | 전체 타입 정합 |
| 빌드 | next build | 10 route | 프로덕션 빌드 |
| 스키마 | prisma validate | valid | DB 스키마 정합 |

실행:
```bash
npm test         # 단위+통합 (47)
npm run dev      # 데모 앱 (인메모리, 외부 계정 불필요)
npm run build    # 프로덕션 빌드
npx playwright test   # 브라우저 E2E (6)  ※ build 후
E2E_BASE=http://localhost:3100 npm run e2e   # HTTP 스모크 (9) ※ 서버 기동 후
```

## 2. 구조

```
src/core/          도메인(외부 의존 0) — 규칙 엔진 + 파서
  rules/           passSelection·bookingEligibility·deduction·finance·capacity (§6)
  parser/          transactionParser (SMS/이메일 거래문자)
src/data/          models·store(시드 인메모리)
src/services/      member·pass·booking·finance·ingest (규칙 조합 = 기능 연결)
src/server/db.ts   싱글톤 저장소(데모) — 프로덕션은 Prisma로 교체
app/               Next.js App Router
  (console)/       운영 콘솔: 대시보드·타임테이블·회원·회원360·출결·재무🔒
  (member)/m/      회원앱: 예약·마이페이지
  actions.ts       서버 액션(예약·출결·발급·초대·거래확정·인입)
  api/reset/       데모 리셋(E2E)
prisma/schema.prisma  데이터모델(Postgres/Supabase 타겟)
tests/             *.test.ts 단위·통합 / *.e2e.ts HTTP / pw/*.spec.ts 브라우저
```

## 3. 코드 리뷰 — E2E로 발견·수정한 결함

> "테스트로 문제를 잡아가며 수정"한 실제 이력.

| # | 발견 계층 | 문제 | 원인 | 수정 |
|---|----------|------|------|------|
| 1 | 통합테스트 | 발급 후 잔여가 엉뚱하게 차감 | 시드 `mp_5` 갭 + `length+1` ID가 기존 ID와 **충돌** | `nextId`(최대 접미사+1)로 교체 |
| 2 | next build | 타입 에러 | 손익 `byCategory`를 `counted`(PnL)에서 접근 | `cashBasis.byCategory`로 수정 |
| 3 | next build | 타입 에러 | `receivable` vs `receivables` 오타 | 복수형으로 수정 |
| 4 | Playwright | `/api/reset` 404로 전 플로우 실패 | Next에서 **`_`폴더는 라우팅 제외**(private) | `api/_reset`→`api/reset` |

→ 4건 모두 테스트가 잡았고, 코어 규칙 자체 결함은 0(단위테스트 선검증).

## 4. 기능 연결(통합) 검증 포인트

- **예약**: `checkBookingEligibility`(자격) → `selectPassForBooking`(선택) → `applyDeduction('book')` 정책차감 — 서비스가 규칙을 순서대로 호출.
- **출석/취소/폐강**: `applyDeduction`로 잔여 복구·차감, 기간권은 횟수 불변.
- **손익**: 발급(약정매출)은 **현금 순익 불변** → SMS 입금 확정 시에만 순익 반영(§6.4 이중계상 방지)을 통합테스트로 못박음.
- **SMS**: `parseFinancialMessage` → dedupe → `transaction(needs_review)` → 확인 큐 → 확정 시 손익 반영.

## 5. 실제(real) vs 데모(stub) — 정직한 경계

**실제 동작(이 저장소에서 검증됨)**
- 도메인 규칙·파서·서비스 로직 (테스트로 증명)
- Next UI 전 화면 렌더 + 서버액션 변경 흐름
- Prisma 스키마(유효)

**데모/대체(팀이 프로덕션 전환 시 교체)**
- 저장소: **인메모리 싱글톤** → Prisma/Supabase 구현으로 교체(서비스 시그니처 유지)
- 인증: 미구현 → 휴대폰 OTP(Solapi) + 역할 게이트
- 알림: 미발송 → Solapi/웹푸시
- **SMS 캡처: 안드로이드 컴패니언 별도**(문서 11 PoC) — UI의 "문자 인입"은 파서 시뮬레이션
- 손익 자동연동(마이데이터): v1

## 6. 다음 단계 (프로덕션화)

1. `src/server/db.ts`를 Prisma 클라이언트로 교체 + `prisma migrate`(Supabase 서울)
2. 인증(OTP)·역할 미들웨어로 재무 구역 게이트
3. 알림(Solapi) 연동 + 만료 잡(Inngest)
4. SMS 캡처 PoC(안드로이드) → 검증 후 인입 API 연결
5. 나머지 화면/엣지(홀딩·환불·대기승급 등)와 v1 기능
