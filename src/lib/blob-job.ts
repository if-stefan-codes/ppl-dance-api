import fs from 'fs/promises';
import path from 'path';

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

function jobStatusFilePath(taskId: string): string {
  const safe = taskId.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join('/tmp', `${safe}.json`);
}

async function readTaskRecordFromFile(
  taskId: string
): Promise<TaskRecord | null> {
  try {
    const filePath = jobStatusFilePath(taskId);
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw) as TaskRecord;
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
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;
    if (code === 'ENOENT') return null;
    console.error('[blob-job] readTaskRecordFromFile failed', err);
    return null;
  }
}

export async function saveTaskRecord(
  taskId: string,
  partial: { status: string; videoUrl: string | null }
): Promise<void> {
  try {
    const existing = await readTaskRecordFromFile(taskId);
    const createdAt =
      existing?.createdAt ?? new Date().toISOString();
    const record: TaskRecord = {
      ...partial,
      createdAt,
    };

    await fs.writeFile(
      jobStatusFilePath(taskId),
      JSON.stringify(record),
      'utf8'
    );
  } catch (err) {
    console.error('[blob-job] saveTaskRecord failed', err);
  }
}

export async function getTaskRecord(
  taskId: string
): Promise<TaskRecord | null> {
  return readTaskRecordFromFile(taskId);
}
