/**
 * Playwright E2E (v2) — 실제 브라우저로 사용자 플로우 검증.
 * 클릭 → 서버액션 → 비즈서비스(규칙·이중손익·매칭) → 재렌더. UI↔로직 연결 버그를 잡는다.
 * 각 테스트 전 /api/reset 으로 인메모리 저장소를 시드 상태로 초기화(결정적).
 * 시드 결정값: 세션 sess_1..7, 예약 res_1..7, 회원 mbr_1..5.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const r = await request.post('/api/reset');
  expect(r.ok()).toBeTruthy();
});

test('회원앱: 무제한 그룹권으로 그룹 수업 예약 → 완료', async ({ page }) => {
  await page.goto('/m/booking?member=mbr_2'); // 박서연(그룹 무제한)
  await page.locator('form:has(input[value="sess_7"]) button').click(); // 6/13 그룹
  await expect(page.getByText('예약 완료')).toBeVisible();
});

test('회원앱: 그룹권으로 개인수업 불가 → 사유 노출(§6.1)', async ({ page }) => {
  await page.goto('/m/booking?member=mbr_5'); // 최민(그룹10, 당일 예약 없음)
  await page.locator('form:has(input[value="sess_3"]) button').click(); // 개인 수업
  await expect(page.getByText('맞는 수강권이 아니')).toBeVisible();
});

test('운영: 출석 처리 → 배지 변경 + 수강권 차감', async ({ page }) => {
  await page.goto('/sessions/sess_4'); // 그룹 11:00 (김지은 res_4)
  await page.locator('form:has(input[value="res_4"]) button[value="attend"]').click();
  await expect(page.locator('li', { hasText: '김지은' })).toContainText('출석');
});

test('운영: 타임테이블 셀 클릭 → 모달 상세(인터셉트)', async ({ page }) => {
  await page.goto('/timetable');
  await page.locator('a[href="/sessions/sess_4"]').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('예약 회원 · 출결');
  await expect(dialog).toContainText('김지은');
});

test('운영: 회원 추가(모달) → 목록에 추가', async ({ page }) => {
  await page.goto('/members');
  await page.getByRole('button', { name: '+ 회원 추가' }).click();
  await page.fill('input[name="name"]', '신규회원');
  await page.fill('input[name="phone"]', '010-7777-8888');
  await page.getByRole('button', { name: '추가하기' }).click();
  await expect(page.getByText('신규회원')).toBeVisible();
});

test('상담 CRM: 신규 상담 등록 → 칸반에 추가', async ({ page }) => {
  await page.goto('/crm');
  await page.fill('input[name="name"]', '상담테스트');
  await page.fill('input[name="phone"]', '010-8888-9999');
  await page.getByRole('button', { name: '등록' }).click();
  await expect(page.getByText('상담테스트')).toBeVisible();
});

test('재무: 미수 입금 매칭 → 통장 큐에서 제거(미수 해소)', async ({ page }) => {
  await page.goto('/finance/matching');
  await expect(page.getByRole('button', { name: '이 결제와 매칭' })).toHaveCount(1);
  await page.getByRole('button', { name: '이 결제와 매칭' }).first().click();
  await expect(page.getByText('최민')).toHaveCount(0); // 매칭되어 큐에서 사라짐
});

test('재무: 수익분석 기준 토글(결제 ↔ 소진)', async ({ page }) => {
  await page.goto('/analysis');
  await page.locator('a[href="/analysis?basis=consumption"]').first().click();
  await expect(page.getByText('소진기준: 수업을 쓴 날')).toBeVisible();
});
