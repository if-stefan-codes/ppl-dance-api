import { NextResponse } from 'next/server';
import { getJobStatus, setJobStatus } from '@/lib/job-status-store';

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

/** Pull video URL from a work item (field names vary by API version). */
function videoUrlFromWork(work: UnknownRecord): string | null {
  return firstString(
    work.videoUrl,
    work.outputUrl,
    work.url,
    work.resultUrl,
    work.video,
    typeof work.output === 'string' ? work.output : null,
    asRecord(work.output)?.url,
    asRecord(work.result)?.url
  );
}

function statusFromWork(work: UnknownRecord): string | null {
  return firstString(work.status, work.state, work.taskStatus);
}

/**
 * Extract taskId and works[] from kie.ai webhook body (flexible shapes).
 */
function parseKieCallback(payload: unknown): {
  taskId: string | null;
  works: UnknownRecord[];
} {
  const root = asRecord(payload);
  if (!root) return { taskId: null, works: [] };

  const taskId =
    firstString(
      root.taskId,
      root.task_id,
      asRecord(root.data)?.taskId,
      asRecord(root.data)?.task_id,
      asRecord(root.result)?.taskId
    ) ?? null;

  let worksRaw: unknown = root.works;
  if (worksRaw == null && root.data != null)
    worksRaw = asRecord(root.data)?.works;
  if (worksRaw == null && root.result != null)
    worksRaw = asRecord(root.result)?.works;

  const works: UnknownRecord[] = [];
  if (Array.isArray(worksRaw)) {
    for (const item of worksRaw) {
      const w = asRecord(item);
      if (w) works.push(w);
    }
  }

  return { taskId, works };
}

export async function GET() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    console.log('[api/callback] raw request body', rawBody);

    let payload: unknown;
    try {
      payload = rawBody.trim() ? JSON.parse(rawBody) : null;
    } catch (parseErr) {
      console.log('[api/callback] JSON parse failed', parseErr);
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { taskId, works } = parseKieCallback(payload);
    console.log('[api/callback] extracted taskId', taskId);

    if (!taskId) {
      return NextResponse.json(
        { error: 'Missing taskId in webhook payload' },
        { status: 400 }
      );
    }

    const primary = works[0] ?? {};
    const videoUrl = works.map(videoUrlFromWork).find(Boolean) ?? null;
    const status =
      statusFromWork(primary) ||
      (videoUrl ? 'completed' : 'processing');

    setJobStatus(taskId, { status, videoUrl });
    const afterSave = getJobStatus(taskId);
    console.log('[api/callback] setJobStatus (in-memory) result', afterSave);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/callback] failed', err);
    return NextResponse.json(
      { ok: false, error: 'Callback handling failed' },
      { status: 502 }
    );
  }
}
