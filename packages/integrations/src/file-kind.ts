import { fileTypeFromBuffer } from 'file-type';

/**
 * The media type of a file from its content (magic bytes), never from its name or the type the
 * browser claims. Returns null when the content isn't recognised.
 */
export async function detectMediaType(body: Buffer): Promise<string | null> {
  const kind = await fileTypeFromBuffer(body);
  return kind?.mime ?? null;
}

/** File name safe to show and to send in Content-Disposition: no paths, controls or quotes. */
export function safeFileName(name: string, fallback = 'evidence'): string {
  const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
  const cleaned = base
    .normalize('NFC')
    .replace(/[\p{Cc}"]/gu, '')
    .trim()
    .slice(0, 150);
  return cleaned === '' ? fallback : cleaned;
}
