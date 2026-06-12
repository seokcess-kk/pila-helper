/**
 * E2E 스모크 (HTTP) — v2 빌드 앱의 모든 라우트가 200 + 핵심 데이터 렌더 확인.
 * 사전: `npm run build && next start -p 3100`. (E2E_BASE 로 변경 가능)
 */
import { describe, expect, it } from 'vitest';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3100';

async function html(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(BASE + path);
  return { status: res.status, body: await res.text() };
}

describe('E2E 스모크 — v2 라우트 렌더링', () => {
  it('/ → /dashboard 리다이렉트', async () => {
    const res = await fetch(BASE + '/', { redirect: 'manual' });
    expect([200, 307, 308]).toContain(res.status);
  });

  it('대시보드: 4영역 + 이번 달 손익(결제기준 순매출 1,450,000)', async () => {
    const { status, body } = await html('/dashboard');
    expect(status).toBe(200);
    expect(body).toContain('오늘의 운영');
    expect(body).toContain('영업이익');
    expect(body).toContain('1,450,000');
  });

  it('타임테이블: 주간 수업', async () => {
    const { status, body } = await html('/timetable');
    expect(status).toBe(200);
    expect(body).toContain('타임테이블');
    expect(body).toContain('그룹 매트');
  });

  it('회원 목록: 김지은 + 미수 회원 최민', async () => {
    const { status, body } = await html('/members');
    expect(status).toBe(200);
    expect(body).toContain('김지은');
    expect(body).toContain('최민');
    expect(body).toContain('미수금');
  });

  it('회원 360°: 보유 수강권·발급', async () => {
    const { status, body } = await html('/members/mbr_1');
    expect(status).toBe(200);
    expect(body).toContain('보유 수강권');
    expect(body).toContain('수강권 발급');
  });

  it('수업 출결: 예약 회원', async () => {
    const { status, body } = await html('/sessions/sess_4');
    expect(status).toBe(200);
    expect(body).toContain('출결');
    expect(body).toContain('김지은');
  });

  it('상담 CRM: 파이프라인 + 전환율', async () => {
    const { status, body } = await html('/crm');
    expect(status).toBe(200);
    expect(body).toContain('상담 CRM');
    expect(body).toContain('전환율');
  });

  it('손익: 결제/소진 기준 + 비용', async () => {
    const { status, body } = await html('/finance');
    expect(status).toBe(200);
    expect(body).toContain('영업이익');
    expect(body).toContain('결제기준');
  });

  it('거래 매칭: 미수 회원 입금 추천(최민)', async () => {
    const { status, body } = await html('/finance/matching');
    expect(status).toBe(200);
    expect(body).toContain('매칭');
    expect(body).toContain('최민');
  });

  it('수익분석: 이중기준 + 월말 예상', async () => {
    const { status, body } = await html('/analysis');
    expect(status).toBe(200);
    expect(body).toContain('수익분석');
    expect(body).toContain('월말 예상');
  });

  it('회원앱 예약: 세션 + 예약 버튼', async () => {
    const { status, body } = await html('/m/booking?member=mbr_1');
    expect(status).toBe(200);
    expect(body).toContain('예약');
    expect(body).toContain('그룹 매트');
  });

  it('회원앱 마이페이지: 내 수강권', async () => {
    const { status, body } = await html('/m/mypage?member=mbr_1');
    expect(status).toBe(200);
    expect(body).toContain('내 수강권');
    expect(body).toContain('출석');
  });
});
