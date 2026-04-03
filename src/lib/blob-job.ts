import { list, put } from '@vercel/blob';

export type TaskRecord = {
  status: string;
  videoUrl: string | null;
  createdAt: string;
};

function assertBlobToken(): void {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }
}

/** Blob pathname: jobs/{taskId}.json (taskId sanitized for path safety). */
export function jobJsonPathname(taskId: string): string {
  const safe = taskId.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return `jobs/${safe}.json`;
}

export async function saveTaskRecord(
  taskId: string,
  partial: { status: string; videoUrl: string | null }
): Promise<void> {
  assertBlobToken();
  const pathname = jobJsonPathname(taskId);
  const existing = await getTaskRecord(taskId);
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
  });
}

export async function getTaskRecord(
  taskId: string
): Promise<TaskRecord | null> {
  assertBlobToken();
  const pathname = jobJsonPathname(taskId);
  const { blobs } = await list({
    prefix: pathname,
    limit: 20,
  });
  const blob =
    blobs.find((b) => b.pathname === pathname) ?? blobs[0] ?? null;
  if (!blob) return null;

  const res = await fetch(blob.downloadUrl);
  if (!res.ok) return null;
  try {
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
  } catch {
    return null;
  }
}
