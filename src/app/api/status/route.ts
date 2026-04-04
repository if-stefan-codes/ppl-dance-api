import { NextRequest, NextResponse } from 'next/server';
import { getJobStatus } from '@/lib/job-status-store';

export async function GET(request: NextRequest) {
  try {
    const taskId = request.nextUrl.searchParams.get('taskId')?.trim();
    console.log('[api/status] taskId query param', taskId ?? '(missing)');
    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId query parameter is required' },
        { status: 400 }
      );
    }

    const record = getJobStatus(taskId);
    console.log('[api/status] getJobStatus (in-memory) result', record);
    if (!record) {
      return NextResponse.json(
        { error: 'Unknown taskId' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: record.status,
      videoUrl: record.videoUrl,
      createdAt: record.createdAt,
    });
  } catch (err) {
    console.error('[api/status] failed', err);
    return NextResponse.json(
      {
        error: 'Status lookup failed',
        status: null,
        videoUrl: null,
        createdAt: null,
      },
      { status: 502 }
    );
  }
}
