import { NextResponse } from 'next/server';
import { resetDb } from '@/server/db2.js';

// 데모/E2E 전용: 인메모리 저장소를 시드 상태로 리셋
export const dynamic = 'force-dynamic';

export async function POST() {
  // 데모/E2E 전용. 프로덕션에서는 DISABLE_DEMO_RESET=1 로 차단(전체 시드 리셋 남용 방지).
  if (process.env.DISABLE_DEMO_RESET === '1') {
    return NextResponse.json({ ok: false, error: 'disabled' }, { status: 403 });
  }
  resetDb();
  return NextResponse.json({ ok: true });
}
