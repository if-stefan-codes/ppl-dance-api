export type JobStatusRecord = {
  status: string;
  videoUrl: string | null;
  createdAt: string;
};

const g = globalThis as typeof globalThis & {
  __pplJobStatusStore?: Map<string, JobStatusRecord>;
};

const store =
  g.__pplJobStatusStore ??
  (g.__pplJobStatusStore = new Map<string, JobStatusRecord>());

export function setJobStatus(
  taskId: string,
  partial: { status: string; videoUrl: string | null }
): void {
  const existing = store.get(taskId);
  store.set(taskId, {
    ...partial,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });
}

export function getJobStatus(taskId: string): JobStatusRecord | null {
  return store.get(taskId) ?? null;
}
