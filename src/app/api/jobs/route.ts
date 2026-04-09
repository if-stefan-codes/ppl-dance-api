import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { redis } from '@/lib/redis';
import type { TaskRecord } from '@/lib/blob-job';

export type JobListItem = {
  taskId: string;
  status: string;
  videoUrl: string | null;
  createdAt: string;
};

/** Bare taskId keys: 32 lowercase hex chars (UUID without dashes). */
const BARE_TASK_ID_HEX32 = /^[a-f0-9]{32}$/;

function parseStoredRecord(raw: unknown): TaskRecord | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as TaskRecord;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as TaskRecord;
  }
  return null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET() {
  try {
    const allKeys = await redis.keys('*');
    const keys = allKeys.filter((k) => BARE_TASK_ID_HEX32.test(k));

    if (keys.length === 0) {
      return NextResponse.json([], { headers: corsHeaders });
    }

    const values = await redis.mget<(string | Record<string, unknown> | null)[]>(
      ...keys
    );

    const items: JobListItem[] = [];
    for (let i = 0; i < keys.length; i++) {
      const taskId = keys[i];
      const rec = parseStoredRecord(values[i]);
      if (!rec) continue;
      items.push({
        taskId,
        status: rec.status,
        videoUrl: rec.videoUrl,
        createdAt: rec.createdAt,
      });
    }

    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const limited = items.slice(0, 50);
    return NextResponse.json(limited, { headers: corsHeaders });
  } catch (err) {
    console.error('[api/jobs] failed', err);
    return NextResponse.json(
      { error: 'Failed to list jobs' },
      { status: 502, headers: corsHeaders }
    );
  }
}
