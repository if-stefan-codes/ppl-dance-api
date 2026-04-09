import { jobKey, redis } from '@/lib/redis';

export type TaskRecord = {
  status: string;
  videoUrl: string | null;
  createdAt: string;
};

export function getBlobReadWriteToken(): string | undefined {
  const trimmed = process.env.PPL_BLOB_READ_WRITE_TOKEN?.trim();
  return trimmed || undefined;
}

export function hasBlobToken(): boolean {
  return Boolean(getBlobReadWriteToken());
}

export async function saveTaskRecord(
  taskId: string,
  partial: { status: string; videoUrl: string | null }
): Promise<void> {
  try {
    const existing = await getTaskRecord(taskId);
    const createdAt =
      existing?.createdAt ?? new Date().toISOString();
    const record: TaskRecord = {
      ...partial,
      createdAt,
    };

    const key = jobKey(taskId);
    await redis.set(key, JSON.stringify(record), { ex: 86400 });
  } catch (err) {
    console.error('[blob-job] saveTaskRecord failed', err);
  }
}

function coerceTaskRecord(data: unknown): TaskRecord | null {
  if (data == null) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as TaskRecord;
    } catch {
      return null;
    }
  }
  if (typeof data === 'object' && !Array.isArray(data)) {
    return data as TaskRecord;
  }
  return null;
}

export async function getTaskRecord(
  taskId: string
): Promise<TaskRecord | null> {
  try {
    let data = await redis.get(jobKey(taskId));
    if (data == null) {
      data = await redis.get(taskId);
    }
    return coerceTaskRecord(data);
  } catch (err) {
    console.error('[blob-job] getTaskRecord failed', err);
    return null;
  }
}
