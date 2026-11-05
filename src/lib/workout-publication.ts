import type { WorkoutPublication } from './model';
import { isPostMentions } from './post-mentions';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const photoPath = new RegExp(`^${uuid}/(${uuid})/${uuid}\\.jpg$`, 'i');

export function isWorkoutPublication(value: unknown, workoutId?: unknown): value is WorkoutPublication {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const publication = value as Record<string, unknown>;
  if (typeof publication.published !== 'boolean' || Object.keys(publication).some(key => !['published', 'photoPath', 'caption', 'mentions'].includes(key))) return false;
  if (publication.caption !== undefined && (typeof publication.caption !== 'string' || publication.caption.length > 1000)) return false;
  if (publication.mentions !== undefined && !isPostMentions(publication.mentions)) return false;
  if (publication.photoPath === undefined) return true;
  if (typeof publication.photoPath !== 'string') return false;
  const match = publication.photoPath.match(photoPath);
  return !!match && (workoutId === undefined || match[1] === workoutId);
}

/** Re-encode locally to remove EXIF/location data; preserve aspect ratio. */
export async function prepareWorkoutPhoto(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Elige una foto JPG, PNG o WebP.');
  if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('La foto debe ocupar como máximo 8 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => { throw new Error('No se ha podido leer la foto. Prueba con otra imagen.'); });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('Elige una foto de hasta 40 megapíxeles.');
    const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Este navegador no permite preparar la foto.');
    context.fillStyle = '#211c2b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const encode = (quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se ha podido preparar la foto.')), 'image/jpeg', quality));
    let blob = await encode(0.85);
    if (blob.size > 1.5 * 1024 * 1024) blob = await encode(0.65);
    if (blob.size > 2 * 1024 * 1024) throw new Error('No se ha podido reducir la foto. Prueba con una imagen más pequeña.');
    return new File([blob], 'entrenamiento.jpg', { type: 'image/jpeg' });
  } finally { URL.revokeObjectURL(url); }
}
