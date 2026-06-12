# 11. SMS 캡처 PoC 스파이크 — 상세 설계

> 차별화(자동 손익)의 **기술 전제** 검증. 결과로 `FIN-4`를 **GO / 조정(이메일 우선) / 보류** 결정.
> 타임박스 **1~2주**. 실행 가능한 수준으로 표본·앱·파서·인입·측정·정책을 명세.
> 연계: [10 §5](10-tech-stack-and-sms-poc.md) · 백로그 `FIN-2/3/4/5` · 규칙 [06 §6.4 현금주의].

---

## 1. 가설 · 결정 게이트

**가설**: "오너의 **안드로이드** 폰에서 카드 승인·입금·취소 문자/알림을 **자동 수집·파싱**해
거래원장에 **충분한 정확도(아래 기준)** 로 등록할 수 있고, **파일럿 배포가 가능**하다."

**결정 매트릭스** (PoC 종료 시):
| 결과 | 조건 | 액션 |
|------|------|------|
| **GO** | 정확도·캡처율 기준 충족 + 파일럿 배포 경로 확보 | FIN-4 SMS 중심 구현 |
| **조정** | 안드로이드 약하거나 정책 막힘, **이메일은 양호** | 이메일 인입 우선 + SMS 보조 |
| **보류** | 둘 다 불확실 | MVP는 CSV+수기, 캡처는 v1로 (차별화 카피 조정) |

---

## 2. 범위 (IN / OUT)

**IN**
- 안드로이드 캡처(NotificationListener 우선, SMS 보조) 신뢰도
- 한국 카드/은행 문자·알림 **파서 정확도**(라벨 표본 기준)
- 인입 목업(`/ingest`) + dedupe + 거래원장 생성
- **Play 정책 검증** + 파일럿 배포 경로
- **병렬 미니 스파이크: 이메일 인입 타당성**(§9)

**OUT** (PoC 아님)
- 프로덕션 UI/디자인, 전체 백엔드, iOS 네이티브
- 분류 자동학습(v1), 마이데이터(v1)
- 완성도 높은 에러처리·다국어

---

## 3. 표본 수집 (PoC의 토대) ★

파서 정확도는 **라벨된 코퍼스** 없이는 측정 불가. 가장 먼저 확보.

**목표 규모**: 카드사 **8+**(신한·삼성·현대·국민·롯데·BC·우리·하나·NH) × {승인, 취소, 부분취소, 할부, 해외, 거절} + 은행 **5+** 입금/출금 → **총 100~150건**.

**수집원(동의 기반)**
- 팀원 본인 폰(명시 동의), **파일럿 오너 폰**(가장 현실적).
- 카드사/은행 공개 문자 포맷 예시(고객센터·도움말).
- 합성 변형(금액·일시·가맹점 치환)으로 보강.

**라벨 스키마** (`samples/*.json`)
```json
{
  "id": "shinhan-approval-001",
  "sender": "15447200",
  "channel": "sms",              // sms | notification
  "package": "com.samsung.android.messaging",
  "raw": "[Web발신] 신한카드 승인 홍*동 55,000원 일시불 06/11 14:23 OO마트",
  "label": {
    "type": "approval",          // approval|deposit|cancel|decline|withdrawal|unknown
    "amount": 55000,
    "occurred_at": "2026-06-11T14:23:00+09:00",
    "merchant_or_payer": "OO마트",
    "installment": 0,
    "issuer": "신한카드"
  }
}
```

**프라이버시**: 이름·카드번호 **마스킹**, 원문 최소·암호화 저장, 표본은 PoC 후 폐기. 금융 발신자만.

---

## 4. 안드로이드 앱 골격 (Kotlin, 디버그 전용)

```
companion-android/
├─ CaptureNotificationListener (NotificationListenerService) ← 1차
│    onNotificationPosted → 발신자/패키지 화이트리스트 필터 → 파서 → Outbox
├─ SmsReceiver (RECEIVE_SMS, BroadcastReceiver)              ← 2차(빌드 플래그)
├─ parser/ (KMP 공유 후보: 정규식 템플릿 + 정규화)
├─ Outbox (Room) — 오프라인 큐 + dedupe_key
├─ Forwarder — HTTPS POST /ingest (Idempotency-Key, 재시도)
├─ Pairing — 웹 발급 코드 입력 → device 등록
└─ BootReceiver / ForegroundService — 재부팅·도즈 복구, 캡처율 로깅
```

**핵심 검증 포인트**
- 권한 UX: 알림 접근 권한(사용자 수동 허용) 안내 흐름.
- **신뢰도**: 도즈 모드·재부팅 후 리스너 자동 복구(BOOT_COMPLETED), 포그라운드 서비스 유지.
- **캡처율 로깅**: 알려진 금융 알림 N건 중 실제 캡처 수 기록.
- 화이트리스트: 발신번호(15××…) + 금융앱 패키지명.

> 팀 스택은 TS이나 컴패니언은 네이티브 필요 → **안드로이드 역량 확보**(팀 내/단기 외주). 순수 백엔드인 **이메일 스파이크(§9)는 TS로 동시 진행** 가능.

---

## 5. 파서 설계

**출력 스키마**
```json
{ "type":"approval", "amount":55000, "currency":"KRW",
  "merchant_or_payer":"OO마트", "occurred_at":"2026-06-11T14:23:00+09:00",
  "installment":0, "issuer":"신한카드", "confidence":0.97, "raw_hash":"…" }
```

**전략**: 발신자별 **템플릿(정규식)** → 정규화. (자동학습은 v1)
- 유형 키워드: 승인/취소/부분취소/해외승인/거절/입금/출금.
- 금액: `([0-9,]+)원` → 콤마 제거 정수.
- 일시: `MM/DD HH:mm` / `MM.DD` / 절대표기 → KST 보정(연도 추정).
- 가맹점/입금자: 뒤쪽 토큰(꼬리) 추출 + 노이즈(잔액·할부) 제거.
- **취소 상계**: 취소문자 → 동일 금액·근접시각 승인과 매칭해 상계.

**예시 템플릿(설명용 — 실제는 코퍼스로 확정)**
```
신한 승인:  ^.*신한카드 승인 .*? ([0-9,]+)원 (일시불|[0-9]+개월) (\d{2}/\d{2}) (\d{2}:\d{2}) (.+)$
NH 입금:    ^.*입금\s*([0-9,]+)원\s*(\d{2}/\d{2})\s*(\d{2}:\d{2})?\s*(.+?)\s*잔액.*$
```

**엣지**: 할부(installment), 부분취소, 해외(통화/환산), 정산 합산입금(추정 대사는 백엔드 §6.4), 본인 이체(제외 후보), [Web발신] 접두 등.

---

## 6. 백엔드 인입 목업 (`/ingest`)

최소 Next Route + Supabase. 계약:
```
POST /ingest
Headers: Authorization: <device token>,  Idempotency-Key: <dedupe_key>
Body: { device_id, channel, sender, received_at, raw_excerpt?, parsed{...} }
→ 200 { ingest_event_id, transaction_id, status: "created"|"duplicate" }

dedupe_key = sha256(issuer | amount | occurred_at(분단위) | type | merchant_tail)
```
- dedupe_key **UNIQUE** → 재전송·중복 알림 무시.
- 생성: `ingest_event(status=linked)` + `transaction(source=sms_capture, status=needs_review)`.
- 거래 확인 큐(S7)에서 사람이 확정.

---

## 7. 정확도 측정 하니스

코퍼스(§3)에 파서를 돌려 자동 채점.
| 지표 | 정의 | 통과 기준 |
|------|------|----------|
| 금액 정확 | label.amount == parsed.amount | **≥95%** |
| 일시 정확 | 분 단위 일치 | **≥90%** |
| 유형 분류 | type 일치 | **≥95%** |
| 가맹점 추출 | fuzzy(사용 가능 수준) | ≥80% |
| **메시지 완전정확** | 위 4개 모두 | **≥90%** |
| 취소 상계 | 취소→승인 매칭 | ≥90% |
| dedupe | 중복 0 · 오병합 0 | **0 오류** |
| 캡처율(현장) | 알려진 알림 중 캡처 | **≥95%**(재부팅·도즈 후) |

산출물: `harness-report.md`(지표 + 오분류 분석 + 실패 케이스 Top-N).

---

## 8. Play 정책 검증 (배포 경로)

**체크리스트**
- `READ_SMS`/`RECEIVE_SMS` = **제한 권한**(기본 문자앱 등 한정) → 정식 배포 거절 위험.
- `NotificationListenerService` = 민감하나 **정당 사유 시 허용**(개인 금융 보조). 데모영상·처리방침 요구 가능.
- **파일럿 경로**: Play **내부 테스트 트랙** 또는 **사이드로드(APK)** → 정책 심사 마찰 회피하며 파일럿 가능?
- **정식 경로**: NotificationListener 정당화 문서 + 개인정보 처리방침 + 권한 선언 폼.

**산출물**: `policy-memo.md` — 파일럿/정식 각 경로의 가능성·요건·리스크.

---

## 9. 병렬 미니 스파이크 — 이메일 인입 (1~2일)

> **iOS 공백 + Play 정책**을 메우는 보조 채널. 순수 백엔드(TS) → 팀이 바로.

- 카드사·은행 **이메일 알림**(승인/입금 통보)을 **Gmail API(읽기 전용)** 또는 IMAP로 수집·파싱.
- 장점: **크로스플랫폼(iOS·PC 포함)** · **Play 정책 무관** · 서버측 처리.
- 검증: 주요 카드사/은행 이메일 알림 제공 여부, 포맷 안정성, 파싱 정확도(동일 하니스 재사용).
- 결과를 §1 결정 매트릭스의 "조정(이메일 우선)" 판단에 투입.

---

## 10. 일정 (1~2주 타임박스)

| 일자 | 워크스트림 |
|------|-----------|
| D1–2 | 표본 수집·라벨링(§3) 시작 + `/ingest` 목업 + capture_device/ingest_event 스키마 |
| D2–3 | 이메일 미니 스파이크(§9) — 병렬(TS) |
| D3–6 | Kotlin 앱: NotificationListener + 화이트리스트 + Outbox + Forwarder |
| D5–7 | 파서 템플릿(주요 카드사/은행) + 정규화 |
| D7–8 | 정확도 하니스(§7) 측정·튜닝 |
| D8–9 | 신뢰도(도즈/재부팅) + 캡처율 측정 |
| D9 | Play 정책 메모(§8) |
| D10 | **종합 리포트 + GO/조정/보류 권고** |

---

## 11. 산출물 (Deliverables)

1. `samples/` 라벨 코퍼스(마스킹) + 라벨 스키마
2. `companion-android/` 디버그 APK + 소스
3. `parser/` 라이브러리 + 템플릿
4. `ingest` 목업(Next Route)
5. `harness-report.md`(정확도·캡처율)
6. `policy-memo.md`(배포 경로)
7. `email-spike.md`(이메일 타당성)
8. **`decision.md` — GO/조정/보류 권고 + 근거**

---

## 12. 리스크 & 컨틴전시

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Play 정책 거절 | 정식 배포 막힘 | 파일럿=내부테스트/사이드로드, 정식=NotificationListener 정당화 or 이메일 전환 |
| 카드사별 포맷 편차 | 정확도 저하 | 발신자별 템플릿 + 확인 큐(사람 확정)로 보정, 미지원은 needs_review |
| 백그라운드 신뢰도(도즈) | 누락 | 포그라운드 서비스·재시작·Outbox 재전송, 누락분 CSV 보완 |
| iOS 미지원 | 반쪽 | 이메일·OCR·CSV로 커버(§9) |
| 안드로이드 역량 부족 | 일정 | 단기 외주/페어링, 이메일 스파이크 먼저로 가치 일부 확보 |
| 개인정보·금융정보 | 법·신뢰 | 금융 발신자만·최소 저장·암호화·명시 동의·처리방침(NFR-2) |

---

## 13. 데이터 모델 확정 (→ 06 반영 제안)

```
capture_device  (id, studio_id, platform='android', label, push_token?,
                 paired_at, last_seen_at, status[active|revoked])
ingest_event    (id, studio_id, device_id, channel[sms|notification|email],
                 sender, received_at, dedupe_key UNIQUE, raw_ref? (최소/암호화),
                 parsed jsonb, status[parsed|failed|linked|duplicate],
                 transaction_id? , created_at)
transaction.source += 'email_capture'
```
> PoC가 GO/조정이면 06에 정식 반영.

---

## 14. 다음 단계

1. **표본 수집 + 이메일 스파이크 즉시 시작**(병렬, 리스크 큰 것부터)
2. 안드로이드 역량 확보(팀/외주) 확정
3. D10 `decision.md` → FIN-4 방향 확정 → 스프린트 0(FND)와 합류
