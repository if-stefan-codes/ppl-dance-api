import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { getTaskRecord } from '@/lib/blob-job';

const BARE_TASK_ID_HEX32 = /^[a-f0-9]{32}$/;

function isMissingVideoUrl(videoUrl: string | null): boolean {
  return videoUrl == null || String(videoUrl).trim() === '';
}

async function runCronJob(): Promise<NextResponse> {
  try {
    const allKeys = await redis.keys('*');
    const taskIds = allKeys.filter((k) => BARE_TASK_ID_HEX32.test(k));

    let skippedHadVideo = 0;
    const missingVideoTaskIds: string[] = [];

    for (const taskId of taskIds) {
      const rec = await getTaskRecord(taskId);
      if (!rec) continue;

      if (!isMissingVideoUrl(rec.videoUrl)) {
        skippedHadVideo += 1;
        continue;
      }

      missingVideoTaskIds.push(taskId);
      console.log('[api/cron] job with null/empty videoUrl', taskId, {
        status: rec.status,
        createdAt: rec.createdAt,
      });
    }

    return NextResponse.json({
      ok: true,
      scannedJobKeys: taskIds.length,
      withVideoUrl: skippedHadVideo,
      nullOrEmptyVideoUrl: missingVideoTaskIds.length,
      taskIdsMissingVideo: missingVideoTaskIds,
    });
  } catch (err) {
    console.error('[api/cron] failed', err);
    return NextResponse.json(
      {
        ok: false,
        error: 'Cron run failed',
        scannedJobKeys: 0,
        withVideoUrl: 0,
        nullOrEmptyVideoUrl: 0,
        taskIdsMissingVideo: [] as string[],
      },
      { status: 502 }
    );
  }
}

export async function GET() {
  return runCronJob();
}

/** Manual trigger (Vercel Cron still uses GET). */
export async function POST() {
  return runCronJob();
}
