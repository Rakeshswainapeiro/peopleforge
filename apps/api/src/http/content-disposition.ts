/**
 * `Content-Disposition: attachment` for a stored file name (already sanitised: no paths,
 * controls or quotes). RFC 6266: an ASCII fallback for old clients plus the exact UTF-8 name,
 * so Arabic file names download intact. Always `attachment`: evidence never renders inline.
 */
export function attachmentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\%]/gu, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/gu,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
