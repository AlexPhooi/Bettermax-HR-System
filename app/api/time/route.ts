// GET /api/time
// Returns the current server time (NTP-synced on Vercel).
// Used by the photo watermark to prevent phone-clock manipulation.
import { NextResponse } from 'next/server';

export async function GET() {
  const now = new Date();
  return NextResponse.json({
    iso:      now.toISOString(),
    // Malaysia time (UTC+8) formatted for display
    date:     now.toLocaleDateString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', year: 'numeric' }),
    time:     now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  });
}
