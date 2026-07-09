import { type ServerResponse } from 'node:http';
import { graphBinary } from './graph.js';

const imageProxyCache = new Map<string, { buffer: Buffer; contentType: string; etag?: string; cachedAt: number }>();
const imageProxyCacheTtlMs = 30 * 60 * 1000;
const imageProxyCacheMaxEntries = 200;

function cachedOneNoteImage(src: string) {
  const cached = imageProxyCache.get(src);
  if (!cached) return undefined;
  if (Date.now() - cached.cachedAt > imageProxyCacheTtlMs) {
    imageProxyCache.delete(src);
    return undefined;
  }
  return cached;
}

function setCachedOneNoteImage(src: string, value: { buffer: Buffer; contentType: string; etag?: string }): void {
  if (imageProxyCache.size >= imageProxyCacheMaxEntries) {
    const oldest = [...imageProxyCache.entries()]
      .sort((left, right) => left[1].cachedAt - right[1].cachedAt)[0]?.[0];
    if (oldest) imageProxyCache.delete(oldest);
  }
  imageProxyCache.set(src, { ...value, cachedAt: Date.now() });
}

function sniffImageContentType(buffer: Buffer): string | undefined {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 6) {
    const signature = buffer.subarray(0, 6).toString('ascii');
    if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif';
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp';
  if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) return 'image/x-icon';
  const head = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || head.startsWith('<?xml') && head.includes('<svg')) return 'image/svg+xml';
  return undefined;
}

function graphImageContentType(fetched: { buffer: Buffer; contentType: string }): string | undefined {
  const contentType = fetched.contentType.split(';', 1)[0]?.trim().toLowerCase() || '';
  if (contentType.startsWith('image/')) return fetched.contentType;
  return sniffImageContentType(fetched.buffer);
}

function validatedOneNoteImageSource(value: string): string {
  const src = new URL(value);
  if (src.protocol !== 'https:' || src.hostname !== 'graph.microsoft.com' || !src.pathname.startsWith('/v1.0/')) {
    const error = new Error('Only Microsoft Graph v1.0 image URLs can be proxied.') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  return src.toString();
}

export async function oneNoteImage(response: ServerResponse, srcValue: string): Promise<void> {
  const src = validatedOneNoteImageSource(srcValue);
  let image = cachedOneNoteImage(src);
  if (!image) {
    const fetched = await graphBinary(src, 'image/*,*/*');
    const contentType = graphImageContentType(fetched);
    if (!contentType) {
      const error = new Error(`Graph resource is not an image: ${fetched.contentType}`) as Error & { statusCode?: number };
      error.statusCode = 415;
      throw error;
    }
    setCachedOneNoteImage(src, { ...fetched, contentType });
    image = cachedOneNoteImage(src);
  }
  if (!image) throw new Error('OneNote image cache failed.');
  response.writeHead(200, {
    'Content-Type': image.contentType,
    'Cache-Control': 'private, max-age=1800',
    'X-Content-Type-Options': 'nosniff',
    ...(image.etag ? { ETag: image.etag } : {})
  });
  response.end(image.buffer);
}
