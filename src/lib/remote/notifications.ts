import { remoteClient, verifiedUser } from './auth';

export type SocialNotification = {
  id: string; actor_id: string; kind: 'follow' | 'workout'; workout_id: string | null;
  created_at: string; read_at: string | null; username: string; display_name: string; photo: string | null; workout_label: string | null;
};
export type NotificationPage = { unread: number; items: SocialNotification[] };
export async function readNotifications(signal: AbortSignal, before?: SocialNotification): Promise<NotificationPage> {
  const client = remoteClient();
  if (!client) throw new Error('Necesitas una cuenta para ver las notificaciones.');
  const { data, error } = await client.rpc('cheesit_read_notifications', { p_before: before?.created_at ?? null, p_before_id: before?.id ?? null }).abortSignal(AbortSignal.any([signal, AbortSignal.timeout(15000)]));
  if (error || !data || !Array.isArray(data.items)) throw new Error('No se han podido cargar las notificaciones. Comprueba la conexión y reintenta.');
  return data as NotificationPage;
}
export async function markNotifications(owner: string, id: string | null) {
  if ((await verifiedUser()).id !== owner) throw new Error('La cuenta activa ha cambiado.');
  const { error } = await remoteClient()!.rpc('cheesit_mark_notifications', { p_id: id }).abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error('No se ha confirmado la lectura. Comprueba la conexión y reintenta.');
}

export function notificationTime(instant: string, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(instant)) / 1000));
  if (seconds < 60) return 'Ahora';
  const relative = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });
  if (seconds < 3600) return relative.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return relative.format(-Math.floor(seconds / 3600), 'hour');
  return relative.format(-Math.floor(seconds / 86400), 'day');
}
