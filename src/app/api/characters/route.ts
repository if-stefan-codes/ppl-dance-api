import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';

const EMBED_URL = 'https://drive.google.com/embeddedfolderview?id=';

export type CharacterItem = {
  id: string;
  name: string;
  imgUrl: string;
};

function parseCharactersFromHtml(
  html: string,
  excludeId: string
): CharacterItem[] {
  const nameById = new Map<string, string>();

  const fileRe = /\/file\/d\/([a-zA-Z0-9_-]{25,})(?:\/|$|[?"'#&])/g;
  let m: RegExpExecArray | null;
  while ((m = fileRe.exec(html)) !== null) {
    const id = m[1];
    if (id === excludeId || nameById.has(id)) continue;
    const before = html.slice(Math.max(0, m.index - 4000), m.index);
    const titles = [...before.matchAll(/flip-entry-title[^>]*>([^<]+)</gi)];
    const rawName =
      titles.length > 0 ? titles[titles.length - 1][1].trim() : '';
    nameById.set(id, rawName);
  }

  const guserRe =
    /lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{25,})(?:\/|$|[?"'#&])/g;
  while ((m = guserRe.exec(html)) !== null) {
    const id = m[1];
    if (id === excludeId || nameById.has(id)) continue;
    nameById.set(id, '');
  }

  const noScript = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ''
  );
  const looseRe = /\b([a-zA-Z0-9_-]{25,})\b/g;
  while ((m = looseRe.exec(noScript)) !== null) {
    const id = m[1];
    if (id === excludeId || nameById.has(id)) continue;
    if (id.length > 96) continue;
    nameById.set(id, '');
  }

  return [...nameById.entries()]
    .map(([id, name]) => ({
      id,
      name: name || id,
      imgUrl: `https://lh3.googleusercontent.com/d/${id}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const folderId = request.nextUrl.searchParams.get('folderId')?.trim();
  if (!folderId) {
    return NextResponse.json(
      { error: 'folderId query parameter is required' },
      { status: 400, headers: corsHeaders }
    );
  }

  const url = `${EMBED_URL}${encodeURIComponent(folderId)}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      next: { revalidate: 120 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch Google Drive embed', status: res.status },
        { status: 502, headers: corsHeaders }
      );
    }

    const html = await res.text();
    const items = parseCharactersFromHtml(html, folderId);
    return NextResponse.json(items, { headers: corsHeaders });
  } catch (err) {
    console.error('[api/characters] failed', err);
    return NextResponse.json(
      { error: 'Failed to load Google Drive folder' },
      { status: 502, headers: corsHeaders }
    );
  }
}
