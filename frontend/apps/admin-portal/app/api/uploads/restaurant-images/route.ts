import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { BASE_PATH } from '@/lib/base-path';

export const runtime = 'nodejs';

const maxImageSizeBytes = 5 * 1024 * 1024;
const uploadPermissions = ['RESTAURANT_CREATE', 'RESTAURANT_UPDATE'];

/** The image type from the file's own first bytes; the browser's declared type is not trusted. */
function imageExtension(bytes: Uint8Array): '.jpg' | '.png' | '.webp' | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return '.jpg';
  }

  if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') {
    return '.png';
  }

  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return '.webp';
  }

  return null;
}

/**
 * The user service, as this server reaches it: USER_SERVICE_URL when set (the in-cluster
 * service), else the portal's configured API URL, else this same origin under the API prefix.
 */
function userServiceUrl(request: Request): string {
  const configured = process.env.USER_SERVICE_URL || process.env.NEXT_PUBLIC_USER_API_URL;

  if (configured && /^https?:\/\//.test(configured)) {
    return configured.replace(/\/+$/, '');
  }

  return `${new URL(request.url).origin}${BASE_PATH}/api/v1`;
}

/**
 * Only a signed-in user who may create or edit restaurants can upload. The user service
 * resolves the token and the permissions as they are now, so a revoked session or removed
 * permission takes effect at once. Returns the refusal, or null when allowed.
 */
async function refuseUnlessAllowed(request: Request): Promise<NextResponse | null> {
  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ message: 'Sign in to upload images.' }, { status: 401 });
  }

  let response: Response;

  try {
    response = await fetch(`${userServiceUrl(request)}/users/me/access`, {
      headers: { authorization },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to check your access right now. Please try again.' },
      { status: 503 },
    );
  }

  if (response.status === 401) {
    return NextResponse.json({ message: 'Sign in to upload images.' }, { status: 401 });
  }

  if (!response.ok) {
    return NextResponse.json(
      { message: 'Unable to check your access right now. Please try again.' },
      { status: 503 },
    );
  }

  const body = (await response.json().catch(() => null)) as {
    data?: { permissions?: unknown };
  } | null;
  const permissions = Array.isArray(body?.data?.permissions) ? body.data.permissions : [];

  if (!uploadPermissions.some((permission) => permissions.includes(permission))) {
    return NextResponse.json(
      { message: 'You do not have permission to upload restaurant images.' },
      { status: 403 },
    );
  }

  return null;
}

export async function POST(request: Request) {
  // Refuse oversized bodies from the declared length, before formData() buffers the whole thing
  // in memory; the size check further down only ran after that. 64KB covers multipart framing.
  const declaredLength = Number(request.headers.get('content-length'));

  if (!(declaredLength > 0 && declaredLength <= maxImageSizeBytes + 64 * 1024)) {
    return NextResponse.json({ message: 'Image is too large.' }, { status: 413 });
  }

  const refusal = await refuseUnlessAllowed(request);

  if (refusal) {
    return refusal;
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!file || typeof file === 'string') {
    return NextResponse.json({ message: 'Choose an image to upload.' }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();

  if (arrayBuffer.byteLength > maxImageSizeBytes) {
    return NextResponse.json({ message: 'Image must be 5MB or smaller.' }, { status: 400 });
  }

  const extension = imageExtension(
    new Uint8Array(arrayBuffer, 0, Math.min(12, arrayBuffer.byteLength)),
  );

  if (!extension) {
    return NextResponse.json(
      { message: 'Only JPG, PNG, or WEBP images are allowed.' },
      { status: 400 },
    );
  }

  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'restaurants');
  const filename = `${Date.now()}-${randomUUID()}${extension}`;

  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, filename), Buffer.from(arrayBuffer));

  return NextResponse.json({
    url: `/uploads/restaurants/${filename}`,
  });
}
