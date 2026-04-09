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

/** UUID without dashes (32 hex chars). */
const BARE_TASK_ID_HEX32 = /^[0-9a-f]{32}$/i;

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

function taskIdFromRedisKey(key: string): string | null {
  if (key.startsWith('job:')) {
    return key.slice('job:'.length) || null;
  }
  if (BARE_TASK_ID_HEX32.test(key)) {
    return key;
  }
  return null;
}

function newerItem(a: JobListItem, b: JobListItem): JobListItem {
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  if (tb !== ta) return tb >= ta ? b : a;
  if (a.videoUrl && !b.videoUrl) return a;
  if (b.videoUrl && !a.videoUrl) return b;
  return a;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET() {
  try {
    const [jobKeys, allKeys] = await Promise.all([
      redis.keys('job:*'),
      redis.keys('*'),
    ]);

    const bareHexKeys = allKeys.filter((k) => BARE_TASK_ID_HEX32.test(k));
    const uniqueKeys = [...new Set([...jobKeys, ...bareHexKeys])];

    if (uniqueKeys.length === 0) {
      return NextResponse.json([], { headers: corsHeaders });
    }

    const values = await redis.mget<(string | Record<string, unknown> | null)[]>(
      ...uniqueKeys
    );

    const byTaskId = new Map<string, JobListItem>();
    for (let i = 0; i < uniqueKeys.length; i++) {
      const key = uniqueKeys[i];
      const taskId = taskIdFromRedisKey(key);
      if (!taskId) continue;

      const rec = parseStoredRecord(values[i]);
      if (!rec) continue;

      const item: JobListItem = {
        taskId,
        status: rec.status,
        videoUrl: rec.videoUrl,
        createdAt: rec.createdAt,
      };

      const prev = byTaskId.get(taskId);
      byTaskId.set(taskId, prev ? newerItem(prev, item) : item);
    }

    const items = [...byTaskId.values()].sort(
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
