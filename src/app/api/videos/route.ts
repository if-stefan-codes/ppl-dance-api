import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { getBlobReadWriteToken } from '@/lib/blob-job';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET() {
  try {
    const token = getBlobReadWriteToken();
    if (!token) {
      return NextResponse.json([], { headers: corsHeaders });
    }

    const { blobs } = await list({
      prefix: 'videos/',
      limit: 1000,
      token,
    });

    const items = blobs.map((b) => ({
      name: b.pathname,
      url: b.url,
    }));

    return NextResponse.json(items, { headers: corsHeaders });
  } catch (err) {
    console.error('[api/videos] list failed', err);
    return NextResponse.json([], { headers: corsHeaders });
  }
}
