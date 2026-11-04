import type { Workout } from '../model';
import { remoteClient, verifiedUser } from './auth';

export const FEED_PAGE_SIZE = 20;
export const WORKOUT_PHOTO_BUCKET = 'workout-photos';
export type FeedCursor = { created_at: string; id: string };
export type FeedPost = {
  id: string; owner_id: string; workout_id: string; created_at: string;
  username: string; display_name: string; photo: string | null;
  workout: Workout; photo_path: string | null; caption?: string | null; likes: number; comments: number; liked: boolean;
};
export type FeedPage = { items: FeedPost[]; next: FeedCursor | null };
export type FeedComment = {
  id: string; owner_id: string; workout_owner: string; workout_id: string;
  body: string; created_at: string; username: string; display_name: string; photo: string | null;
};
export type CommentPage = { items: FeedComment[]; next: FeedCursor | null };

const timeout = (signal?: AbortSignal) => signal
  ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
const client = () => {
  const value = remoteClient();
  if (!value) throw new Error('Necesitas una cuenta para usar el feed.');
  return value;
};
async function assertOwner(owner: string) {
  if ((await verifiedUser()).id !== owner) throw new Error('La cuenta activa ha cambiado. Vuelve a abrir el feed.');
}

/** Server-side keyset pagination: no account documents or private notes are read. */
export async function readFeed(route: { owner?: string; workout?: string; cursor?: FeedCursor | null; following?: boolean } = {}, signal?: AbortSignal): Promise<FeedPage> {
  const { data, error } = await client().rpc('cheesit_read_feed', {
    p_owner: route.owner ?? null, p_workout: route.workout ?? null,
    p_before: route.cursor?.created_at ?? null, p_before_id: route.cursor?.id ?? null,
    p_following: route.following ?? false,
  }).abortSignal(timeout(signal));
  if (error || !data || !Array.isArray(data.items)) throw new Error('No se ha podido cargar el feed. Comprueba la conexión y reintenta.');
  return data as FeedPage;
}

/** Desired-state mutation; retries never toggle a like twice. */
export async function setPostLike(viewer: string, author: string, workout: string, liked: boolean): Promise<FeedPost | null> {
  await assertOwner(viewer);
  const table = client().from('cheesit_post_likes');
  const { error } = liked
    ? await table.insert({ owner_id: viewer, workout_owner: author, workout_id: workout }).abortSignal(timeout())
    : await table.delete().eq('owner_id', viewer).eq('workout_owner', author).eq('workout_id', workout).abortSignal(timeout());
  if (error && !(liked && error.code === '23505')) throw new Error('No se ha confirmado el me gusta. Comprueba la conexión y reintenta.');
  const post = (await readFeed({ owner: author, workout })).items[0] ?? null;
  if (post && post.liked !== liked) throw new Error('El me gusta ha cambiado. Reintenta para consultar su estado.');
  return post;
}

export async function readPostComments(author: string, workout: string, cursor?: FeedCursor | null, signal?: AbortSignal): Promise<CommentPage> {
  const { data, error } = await client().rpc('cheesit_read_post_comments', {
    p_owner: author, p_workout: workout, p_before: cursor?.created_at ?? null, p_before_id: cursor?.id ?? null,
  }).abortSignal(timeout(signal));
  if (error || !data || !Array.isArray(data.items)) throw new Error('No se han podido cargar los comentarios. Reintenta.');
  return data as CommentPage;
}

/** Keep the same id across a retry after a lost response to avoid duplicates. */
export async function addPostComment(viewer: string, author: string, workout: string, body: string, idempotencyId = crypto.randomUUID()): Promise<FeedComment> {
  await assertOwner(viewer);
  body = body.trim();
  if (!body || body.length > 2000) throw new Error('Escribe un comentario de entre 1 y 2000 caracteres.');
  const { error } = await client().from('cheesit_post_comments').insert({ id: idempotencyId, owner_id: viewer, workout_owner: author, workout_id: workout, body }).abortSignal(timeout());
  if (error && error.code !== '23505') throw new Error('No se ha confirmado el comentario. Comprueba la conexión y reintenta.');
  const { data: row, error: readError } = await client().from('cheesit_post_comments').select('*').eq('id', idempotencyId).eq('owner_id', viewer).abortSignal(timeout()).single();
  if (readError || !row || row.body !== body || row.workout_owner !== author || row.workout_id !== workout) throw new Error('No se ha confirmado el comentario. Reintenta con el mismo texto.');
  const { data: profile, error: profileError } = await client().from('cheesit_social_profiles').select('username,display_name,photo').eq('owner_id', viewer).abortSignal(timeout()).single();
  if (profileError || !profile) throw new Error('El comentario se ha enviado, pero no se pudo actualizar el perfil. Reintenta.');
  return { ...row, ...profile } as FeedComment;
}

export async function deletePostComment(viewer: string, id: string): Promise<void> {
  await assertOwner(viewer);
  const { error } = await client().from('cheesit_post_comments').delete().eq('id', id).eq('owner_id', viewer).abortSignal(timeout());
  if (error) throw new Error('No se ha confirmado el borrado del comentario. Reintenta.');
}

export async function uploadWorkoutPhoto(viewer: string, workout: string, file: Blob): Promise<string> {
  await assertOwner(viewer);
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[file.type];
  if (!extension || !file.size || file.size > 5 * 1024 * 1024) throw new Error('La foto debe ser JPEG, PNG o WebP y ocupar como máximo 5 MB.');
  if (!/^[0-9a-f-]{36}$/i.test(workout)) throw new Error('El entrenamiento no es válido.');
  const path = `${viewer}/${workout}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await client().storage.from(WORKOUT_PHOTO_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '0', upsert: false });
  if (error || data?.path !== path) throw new Error('No se ha podido subir la foto. Reintenta o guarda sin foto.');
  return path;
}

export async function removeWorkoutPhoto(viewer: string, path: string): Promise<void> {
  await assertOwner(viewer);
  if (!path.startsWith(`${viewer}/`)) throw new Error('No tienes permiso para quitar esta foto.');
  const { error } = await client().storage.from(WORKOUT_PHOTO_BUCKET).remove([path]);
  if (error) throw new Error('No se ha podido quitar la foto. Reintenta.');
}

export async function downloadWorkoutPhoto(path: string, signal?: AbortSignal): Promise<Blob> {
  const { data, error } = await client().storage.from(WORKOUT_PHOTO_BUCKET).download(path, {}, { signal: timeout(signal), cache: 'no-store' });
  if (error || !data) throw new Error('La foto no está disponible o ha dejado de compartirse.');
  return data;
}
