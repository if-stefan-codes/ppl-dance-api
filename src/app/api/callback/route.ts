import { NextResponse } from 'next/server';
import { getTaskRecord, saveTaskRecord } from '@/lib/blob-job';

type UnknownRecord = Record<string, unknown>;

/** kie.ai may send `works` as URL strings or objects. */
type WorkItem = UnknownRecord | string;

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
 * kie.ai order: works[0] as URL string → works[0].url → data.video_url → other work fields.
 */
function extractVideoUrl(
  payload: unknown,
  works: WorkItem[],
  worksRaw: unknown[]
): string | null {
  const w0 = works[0];
  if (typeof w0 === 'string' && w0.trim()) {
    return w0.trim();
  }

  if (w0 && typeof w0 === 'object') {
    const directUrl = firstString((w0 as UnknownRecord).url);
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

  if (w0 && typeof w0 === 'object') {
    const fromWork = videoUrlFromWork(w0 as UnknownRecord);
    if (fromWork) return fromWork;
  }

  for (const w of works) {
    if (typeof w === 'string' && w.trim()) return w.trim();
    const u = videoUrlFromWork(w as UnknownRecord);
    if (u) return u;
  }

  return null;
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
  works: WorkItem[];
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
  const works: WorkItem[] = [];
  for (const item of arr) {
    if (typeof item === 'string' && item.trim()) {
      works.push(item.trim());
      continue;
    }
    const w = asRecord(item);
    if (w) works.push(w);
  }

  return { taskId, works, worksRaw: arr };
}

const KIE_FETCH_TASK_BASE = 'https://api.kie.ai/api/v1/jobs/fetchTask';

/**
 * After completion, Kie may omit video URL in the webhook — refresh from fetchTask.
 * Extract URL only from works[0] as a string or { url }.
 */
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

async function fetchKieTaskAndMaybeVideoUrl(taskId: string): Promise<string | null> {
  const apiKey = process.env.KIE_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[api/callback] KIE_API_KEY missing; skip fetchTask');
    return null;
  }

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

  console.log(
    '[api/callback] kie fetchTask full JSON response',
    JSON.stringify(json)
  );

  if (!res.ok) {
    console.warn('[api/callback] fetchTask non-OK status', res.status);
  }

  return videoUrlFromFetchTaskWorks(json);
}

function logKieWebhookDebug(rawBody: string, payload: unknown) {
  const byteLength = Buffer.byteLength(rawBody, 'utf8');
  console.log('[api/callback] kie.ai webhook — raw body byte length', byteLength);
  console.log('[api/callback] kie.ai webhook — FULL raw body (exact bytes from request)', rawBody);

  const root = asRecord(payload);
  if (!root) {
    console.log(
      '[api/callback] kie.ai webhook — parsed payload is not a plain object',
      payload
    );
    return;
  }

  const data = asRecord(root.data);
  const result = asRecord(root.result);

  const logWorksSlot = (path: string, value: unknown) => {
    const present = value !== undefined && value !== null;
    const isArr = Array.isArray(value);
    console.log(`[api/callback] kie.ai webhook — ${path}`, {
      path,
      present,
      isArray: isArr,
      typeof: typeof value,
      itemTypes: isArr
        ? (value as unknown[]).map((x) => typeof x)
        : undefined,
      json: present ? JSON.stringify(value) : '(absent)',
    });
  };

  logWorksSlot('root.works (top-level)', root.works);
  logWorksSlot('data.works (nested under data)', data?.works);
  logWorksSlot('result.works (nested under result)', result?.works);
}

export async function GET() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    console.log('[FULL CALLBACK]', rawBody);

    let payload: unknown;
    try {
      payload = rawBody.trim() ? JSON.parse(rawBody) : null;
    } catch (parseErr) {
      console.log('[api/callback] JSON parse failed', parseErr);
      console.log(
        '[api/callback] kie.ai webhook — FULL raw body (unparsed)',
        rawBody
      );
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    logKieWebhookDebug(rawBody, payload);

    const { taskId, works, worksRaw } = parseKieCallback(payload);
    console.log('[api/callback] extracted taskId', taskId);
    console.log('[api/callback] merged works used by handler (after parseKieCallback)', {
      worksRawLength: worksRaw.length,
      worksJson: JSON.stringify(works),
    });

    if (!taskId) {
      return NextResponse.json(
        { error: 'Missing taskId in webhook payload' },
        { status: 400 }
      );
    }

    const w0 = works[0];
    const primary =
      w0 != null && typeof w0 === 'object' && !Array.isArray(w0)
        ? (w0 as UnknownRecord)
        : {};
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

    if (status === 'completed') {
      const fromFetch = await fetchKieTaskAndMaybeVideoUrl(taskId);
      if (fromFetch) {
        await saveTaskRecord(taskId, {
          status: 'completed',
          videoUrl: fromFetch,
        });
        const afterFetch = await getTaskRecord(taskId);
        console.log(
          '[api/callback] Redis after fetchTask videoUrl update',
          afterFetch
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/callback] failed', err);
    return NextResponse.json(
      { ok: false, error: 'Callback handling failed' },
      { status: 502 }
    );
  }
}
