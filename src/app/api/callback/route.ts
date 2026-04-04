import { NextResponse } from 'next/server';
import { getTaskRecord, saveTaskRecord } from '@/lib/blob-job';

type UnknownRecord = Record<string, unknown>;

const KIE_COMPLETED_STATUSES = new Set([
  'succeed',
  'succeeded',
  'success',
  'completed',
]);

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

function normalizeKieStatus(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (KIE_COMPLETED_STATUSES.has(key)) return 'completed';
  return raw.trim();
}

/**
 * kie.ai order: works[0].url → works[0] (string) → data.video_url, then other work fields.
 */
function extractVideoUrl(
  payload: unknown,
  works: UnknownRecord[],
  worksRaw: unknown[]
): string | null {
  const w0 = works[0];
  if (w0) {
    const directUrl = firstString(w0.url);
    if (directUrl) return directUrl;
  }

  const firstRaw = worksRaw[0];
  if (typeof firstRaw === 'string' && firstRaw.trim()) {
    return firstRaw.trim();
  }

  const root = asRecord(payload);
  const data = root ? asRecord(root.data) : null;
  const fromData = firstString(data?.video_url, data?.videoUrl);
  if (fromData) return fromData;

  if (w0) {
    const fromWork = videoUrlFromWork(w0);
    if (fromWork) return fromWork;
  }

  return works.map(videoUrlFromWork).find(Boolean) ?? null;
}

function rawStatusFromPayload(
  payload: unknown,
  primary: UnknownRecord
): string | null {
  const root = asRecord(payload);
  const data = root ? asRecord(root.data) : null;
  return firstString(
    statusFromWork(primary),
    root?.status,
    root?.state,
    data?.status,
    data?.state,
    data?.taskStatus
  );
}

/**
 * Extract taskId and works[] from kie.ai webhook body (flexible shapes).
 */
function parseKieCallback(payload: unknown): {
  taskId: string | null;
  works: UnknownRecord[];
  worksRaw: unknown[];
} {
  const root = asRecord(payload);
  if (!root) return { taskId: null, works: [], worksRaw: [] };

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

  const arr = Array.isArray(worksRaw) ? worksRaw : [];
  const works: UnknownRecord[] = [];
  for (const item of arr) {
    if (typeof item === 'string' && item.trim()) {
      works.push({ url: item.trim() });
      continue;
    }
    const w = asRecord(item);
    if (w) works.push(w);
  }

  return { taskId, works, worksRaw: arr };
}

export async function GET() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    console.log(
      '[api/callback] full raw kie.ai request body',
      rawBody
    );

    let payload: unknown;
    try {
      payload = rawBody.trim() ? JSON.parse(rawBody) : null;
    } catch (parseErr) {
      console.log('[api/callback] JSON parse failed', parseErr);
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { taskId, works, worksRaw } = parseKieCallback(payload);
    console.log('[api/callback] extracted taskId', taskId);

    if (!taskId) {
      return NextResponse.json(
        { error: 'Missing taskId in webhook payload' },
        { status: 400 }
      );
    }

    const primary = works[0] ?? {};
    const videoUrl = extractVideoUrl(payload, works, worksRaw);

    const rawStatus = rawStatusFromPayload(payload, primary);
    const status = rawStatus
      ? normalizeKieStatus(rawStatus)
      : videoUrl
        ? 'completed'
        : 'processing';

    await saveTaskRecord(taskId, { status, videoUrl });
    const afterSave = await getTaskRecord(taskId);
    console.log('[api/callback] saveTaskRecord (Redis) result', afterSave);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/callback] failed', err);
    return NextResponse.json(
      { ok: false, error: 'Callback handling failed' },
      { status: 502 }
    );
  }
}
