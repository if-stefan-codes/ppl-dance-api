/** Vercel Blob read/write token (SDK defaults to BLOB_READ_WRITE_TOKEN only). */
export function getBlobReadWriteToken(): string | undefined {
  const token =
    process.env.BLOB_READ_WRITE_TOKEN || process.env.PPL_BLOB_READ_WRITE_TOKEN;
  const trimmed = token?.trim();
  return trimmed || undefined;
}

export function hasBlobToken(): boolean {
  return Boolean(getBlobReadWriteToken());
}
