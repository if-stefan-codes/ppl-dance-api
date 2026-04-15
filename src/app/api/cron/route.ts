import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { getTaskRecord, saveTaskRecord } from '@/lib/blob-job';

const BARE_TASK_ID_HEX32 = /^[a-f0-9]{32}$/;
const KIE_FETCH_TASK_BASE = 'https://api.kie.ai/api/v1/jobs/fetchTask';

type UnknownRecord = Record<string, unknown>;

function asRecord(v: unknown): UnknownRecord | null {
  return v != null && typeof v === 'object' && !Array.isArray(v)
    ? (v as UnknownRecord)
    : null;
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** works[0] as string or works[0].url (root or data). */
function videoUrlFromFetchTaskWorks(json: unknown): string | null {
  const root = asRecord(json);
  if (!root) return null;

  let worksRaw: unknown = root.works;
  if (worksRaw == null && root.data != null) {
    worksRaw = asRecord(root.data)?.works;
  }

  const arr = Array.isArray(worksRaw) ? worksRaw : [];
  const w0 = arr[0];
  if (typeof w0 === 'string' && w0.trim()) return w0.trim();
  const w0o = asRecord(w0);
  if (w0o) {
    const u = firstString(w0o.url);
    if (u) return u;
  }
  return null;
}

async function fetchTaskVideoUrl(taskId: string): Promise<string | null> {
  const apiKey = process.env.KIE_API_KEY?.trim();
  if (!apiKey) return null;

  const url = `${KIE_FETCH_TASK_BASE}?taskId=${encodeURIComponent(taskId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    console.warn('[api/cron] fetchTask non-OK', taskId, res.status);
  }

  return videoUrlFromFetchTaskWorks(json);
}

async function runCronJob(): Promise<NextResponse> {
  try {
    const apiKey = process.env.KIE_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: 'KIE_API_KEY is not configured',
          scanned: 0,
          checkedMissingVideo: 0,
          updated: 0,
        },
        { status: 503 }
      );
    }

    const allKeys = await redis.keys('*');
    const taskIds = allKeys.filter((k) => BARE_TASK_ID_HEX32.test(k));

    let checkedMissingVideo = 0;
    let skippedAlreadyHadVideo = 0;
    let updated = 0;

    for (const taskId of taskIds) {
      const rec = await getTaskRecord(taskId);
      if (!rec) continue;

      if (rec.videoUrl != null && String(rec.videoUrl).trim() !== '') {
        skippedAlreadyHadVideo += 1;
        continue;
      }

      checkedMissingVideo += 1;
      const videoUrl = await fetchTaskVideoUrl(taskId);
      if (videoUrl) {
        await saveTaskRecord(taskId, {
          status: rec.status,
          videoUrl,
        });
        updated += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: taskIds.length,
      checkedMissingVideo,
      skippedAlreadyHadVideo,
      updated,
    });
  } catch (err) {
    console.error('[api/cron] failed', err);
    return NextResponse.json(
      {
        ok: false,
        error: 'Cron run failed',
        scanned: 0,
        checkedMissingVideo: 0,
        updated: 0,
      },
      { status: 502 }
    );
  }
}

export async function GET() {
  return runCronJob();
}

/** Manual trigger (Vercel Cron still uses GET). */
export async function POST() {
  return runCronJob();
}
