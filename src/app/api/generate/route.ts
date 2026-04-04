import { NextResponse } from 'next/server';
import { getPublicBaseUrl } from '@/lib/public-url';

const DEFAULT_KIE_CREATE_URL =
  'https://api.kie.ai/v1/createTask';

export async function POST(request: Request) {
  try {
    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'KIE_API_KEY is not configured' },
        { status: 503 }
      );
    }

    let body: { characterImageUrl?: string; videoUrl?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { characterImageUrl, videoUrl } = body;
    if (
      typeof characterImageUrl !== 'string' ||
      typeof videoUrl !== 'string' ||
      !characterImageUrl.trim() ||
      !videoUrl.trim()
    ) {
      return NextResponse.json(
        { error: 'characterImageUrl and videoUrl are required strings' },
        { status: 400 }
      );
    }

    const callBackUrl = `${getPublicBaseUrl()}/api/callback`;
    const url =
      process.env.KIE_CREATE_TASK_URL?.trim() || DEFAULT_KIE_CREATE_URL;

    const kieRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        characterImageUrl: characterImageUrl.trim(),
        videoUrl: videoUrl.trim(),
        callBackUrl,
      }),
    });

    const text = await kieRes.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        {
          error: 'kie.ai returned non-JSON',
          status: kieRes.status,
          body: text.slice(0, 500),
        },
        { status: 502 }
      );
    }

    if (!kieRes.ok) {
      return NextResponse.json(
        {
          error: 'kie.ai createTask failed',
          status: kieRes.status,
          details: json,
        },
        { status: 502 }
      );
    }

    const obj = json as Record<string, unknown>;
    const data = obj.data as Record<string, unknown> | undefined;
    const taskId =
      (typeof obj.taskId === 'string' && obj.taskId) ||
      (data && typeof data.taskId === 'string' && data.taskId) ||
      (data && typeof data.id === 'string' && data.id) ||
      (typeof obj.id === 'string' && obj.id);

    if (!taskId) {
      return NextResponse.json(
        {
          error: 'kie.ai response missing taskId',
          details: json,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ taskId });
  } catch (err) {
    console.error('[api/generate] failed', err);
    return NextResponse.json(
      { error: 'Generate request failed', taskId: null },
      { status: 502 }
    );
  }
}
