import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'BLOB_READ_WRITE_TOKEN is not configured' },
      { status: 500 }
    );
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json(
      { error: 'Expected multipart/form-data' },
      { status: 400 }
    );
  }

  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: 'Missing or empty file field (use field name "file")' },
      { status: 400 }
    );
  }

  const original =
    typeof file.name === 'string' && file.name.length > 0
      ? file.name
      : 'video.mp4';

  const safeName = original.replace(/[^a-zA-Z0-9._-]/g, '_');
  const pathname = `videos/${Date.now()}-${safeName}`;

  const blob = await put(pathname, file, {
    access: 'public',
    contentType: file.type || 'video/mp4',
  });

  return NextResponse.json({ url: blob.url });
}
