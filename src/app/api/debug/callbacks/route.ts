import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

/**
 * Lists recent raw kie.ai webhook bodies stored under debug:callback:* (see /api/callback).
 */
export async function GET() {
  try {
    const keys = await redis.keys('debug:callback:*');
    const sortedKeys = [...keys].sort();

    const callbacks = await Promise.all(
      sortedKeys.map(async (key) => {
        const value = await redis.get(key);
        return {
          key,
          value: typeof value === 'string' ? value : value == null ? null : String(value),
        };
      })
    );

    return NextResponse.json({
      ok: true,
      count: callbacks.length,
      callbacks,
    });
  } catch (err) {
    console.error('[api/debug/callbacks] failed', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to list debug callbacks' },
      { status: 502 }
    );
  }
}
