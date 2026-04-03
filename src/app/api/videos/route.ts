import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function GET() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'BLOB_READ_WRITE_TOKEN is not configured' },
      { status: 500 }
    );
  }

  const { blobs } = await list({
    prefix: 'videos/',
    limit: 1000,
  });

  const items = blobs.map((b) => ({
    name: b.pathname,
    url: b.url,
  }));

  return NextResponse.json(items);
}
