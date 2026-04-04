import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { getPublicBaseUrl } from '@/lib/public-url';

const DEFAULT_KIE_CREATE_URL =
  'https://api.kie.ai/api/v1/jobs/createTask';

const KIE_CREATE_TASK_MODEL = 'kling-3.0/motion-control';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'KIE_API_KEY is not configured' },
        { status: 503, headers: corsHeaders }
      );
    }

    let body: { characterImageUrl?: string; videoUrl?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400, headers: corsHeaders }
      );
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
        { status: 400, headers: corsHeaders }
      );
    }

    const callBackUrl = `${getPublicBaseUrl()}/api/callback`;
    const url =
      process.env.KIE_CREATE_TASK_URL?.trim() || DEFAULT_KIE_CREATE_URL;

    const kiePayload = {
      model: KIE_CREATE_TASK_MODEL,
      callBackUrl,
      input: {
        prompt: 'The character is dancing energetically.',
        input_urls: [characterImageUrl.trim()],
        video_urls: [videoUrl.trim()],
        mode: '720p',
        character_orientation: 'image',
      },
    };

    console.log('[api/generate] kiePayload', JSON.stringify(kiePayload, null, 2));

    const kieRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(kiePayload),
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
        { status: 502, headers: corsHeaders }
      );
    }

    if (!kieRes.ok) {
      return NextResponse.json(
        {
          error: 'kie.ai createTask failed',
          status: kieRes.status,
          details: json,
        },
        { status: 502, headers: corsHeaders }
      );
    }

    const obj = json as Record<string, unknown>;
    const data = obj.data as Record<string, unknown> | undefined;
    const taskId =
      data && typeof data.taskId === 'string' && data.taskId.trim()
        ? data.taskId.trim()
        : undefined;

    if (!taskId) {
      return NextResponse.json(
        {
          error: 'kie.ai response missing taskId',
          details: json,
        },
        { status: 502, headers: corsHeaders }
      );
    }

    return NextResponse.json({ taskId }, { headers: corsHeaders });
  } catch (err) {
    console.error('[api/generate] failed', err);
    return NextResponse.json(
      { error: 'Generate request failed', taskId: null },
      { status: 502, headers: corsHeaders }
    );
  }
}
