import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

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

    await redis.set(taskId, JSON.stringify(record), { ex: 86400 });
  } catch (err) {
    console.error('[blob-job] saveTaskRecord failed', err);
  }
}

export async function getTaskRecord(
  taskId: string
): Promise<TaskRecord | null> {
  try {
    const data = await redis.get(taskId);
    if (!data) return null;
    return data as TaskRecord;
  } catch (err) {
    console.error('[blob-job] getTaskRecord failed', err);
    return null;
  }
}
