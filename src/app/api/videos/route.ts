import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { getBlobReadWriteToken } from '@/lib/blob-job';

export async function GET() {
  try {
    const token = getBlobReadWriteToken();
    if (!token) {
      return NextResponse.json([]);
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

    return NextResponse.json(items);
  } catch (err) {
    console.error('[api/videos] list failed', err);
    return NextResponse.json([]);
  }
}
