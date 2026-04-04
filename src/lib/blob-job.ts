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

function parseTaskRecord(data: unknown): TaskRecord | null {
  if (data == null || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (typeof o.status !== 'string' || typeof o.createdAt !== 'string')
    return null;
  return {
    status: o.status,
    videoUrl:
      typeof o.videoUrl === 'string' || o.videoUrl === null
        ? o.videoUrl
        : null,
    createdAt: o.createdAt,
  };
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
    if (data == null) return null;
    const parsed = JSON.parse(data as string) as unknown;
    return parseTaskRecord(parsed);
  } catch (err) {
    console.error('[blob-job] getTaskRecord failed', err);
    return null;
  }
}
