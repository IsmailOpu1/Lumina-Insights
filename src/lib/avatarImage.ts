/** Largest size a profile photo is ever shown at, doubled for sharp screens. */
const SIZE = 256;

/**
 * Turns any photo into a small square profile picture: the centre is cropped
 * and scaled to 256px, saved as WebP (JPEG where the browser can't write
 * WebP). A phone photo of several MB becomes about 10-20 KB, so it uploads
 * under the storage limit and loads instantly everywhere it's shown.
 */
export async function avatarImage(file: File): Promise<{ blob: Blob; ext: string }> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(SIZE, side);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();

  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  // Browsers that can't write WebP silently hand back a PNG instead.
  const webp = await encode('image/webp');
  if (webp?.type === 'image/webp') return { blob: webp, ext: 'webp' };
  const jpeg = await encode('image/jpeg');
  if (!jpeg) throw new Error('Could not encode the photo');
  return { blob: jpeg, ext: 'jpg' };
}
