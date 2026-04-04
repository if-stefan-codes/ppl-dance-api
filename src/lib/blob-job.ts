import { list, put } from '@vercel/blob';

export type TaskRecord = {
  status: string;
  videoUrl: string | null;
  createdAt: string;
};

export function getBlobReadWriteToken(): string | undefined {
  const token =
    process.env.BLOB_READ_WRITE_TOKEN || process.env.PPL_BLOB_READ_WRITE_TOKEN;
  const trimmed = token?.trim();
  return trimmed || undefined;
}

export function hasBlobToken(): boolean {
  return Boolean(getBlobReadWriteToken());
}

/** Blob pathname: jobs/{taskId}.json (taskId sanitized for path safety). */
export function jobJsonPathname(taskId: string): string {
  const safe = taskId.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return `jobs/${safe}.json`;
}

/** List prefix jobs/{sanitizedTaskId} to resolve the job JSON object. */
export function jobListPrefix(taskId: string): string {
  const safe = taskId.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return `jobs/${safe}`;
}

async function readTaskRecordFromBlob(taskId: string): Promise<TaskRecord | null> {
  const token = getBlobReadWriteToken();
  if (!token) return null;
  try {
    const pathname = jobJsonPathname(taskId);
    const { blobs } = await list({
      prefix: jobListPrefix(taskId),
      limit: 20,
      token,
    });
    const blob =
      blobs.find((b) => b.pathname === pathname) ?? blobs[0] ?? null;
    if (!blob) return null;

    const res = await fetch(blob.downloadUrl);
    if (!res.ok) return null;
    const data = (await res.json()) as TaskRecord;
    if (typeof data.status !== 'string' || !data.createdAt) return null;
    return {
      status: data.status,
      videoUrl:
        typeof data.videoUrl === 'string' || data.videoUrl === null
          ? data.videoUrl
          : null,
      createdAt: data.createdAt,
    };
  } catch (err) {
    console.error('[blob-job] readTaskRecordFromBlob failed', err);
    return null;
  }
}

export async function saveTaskRecord(
  taskId: string,
  partial: { status: string; videoUrl: string | null }
): Promise<void> {
  const token = getBlobReadWriteToken();
  if (!token) {
    return;
  }
  const pathname = jobJsonPathname(taskId);
  try {
    const existing = await readTaskRecordFromBlob(taskId);
    const createdAt =
      existing?.createdAt ?? new Date().toISOString();
    const record: TaskRecord = {
      ...partial,
      createdAt,
    };

    await put(pathname, JSON.stringify(record), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      token,
    });
  } catch (err) {
    console.error('[blob-job] saveTaskRecord failed', err);
  }
}

export async function getTaskRecord(
  taskId: string
): Promise<TaskRecord | null> {
  return readTaskRecordFromBlob(taskId);
}
