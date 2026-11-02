export const GOOGLE_PENDING = 'cheesit-google-signin-v1';

/** Only callback metadata is read here. Supabase alone consumes tokens/codes. */
export function authReturnInfo(url: string) {
  const parsed = new URL(url);
  const fragment = new URLSearchParams(parsed.hash.slice(1));
  return {
    google: parsed.searchParams.get('oauth') === 'google',
    recovery: fragment.get('type') === 'recovery' || parsed.searchParams.get('recovery') === '1',
    error: fragment.get('error_code') || fragment.get('error') || parsed.searchParams.get('error_code') || parsed.searchParams.get('error') || (fragment.has('error_description') || parsed.searchParams.has('error_description') ? 'unknown' : ''),
  };
}

export function oauthErrorMessage(code: string) {
  if (['access_denied', 'user_cancelled', 'user_canceled'].includes(code)) return 'Has cancelado el acceso con Google. Puedes volver a intentarlo o entrar con correo y contraseña.';
  if (['provider_disabled', 'validation_failed', 'bad_oauth_state', 'flow_state_expired', 'flow_state_not_found'].includes(code)) return 'No se ha podido completar el acceso con Google o el enlace ha caducado. Vuelve a intentarlo desde Cheesit.';
  return 'No se ha podido completar el acceso con Google. Vuelve a intentarlo o entra con correo y contraseña.';
}

export function googleRedirectUrl(origin: string) {
  const parsed = new URL(origin);
  if (parsed.origin !== origin || (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)))) throw new Error('El origen de acceso no es válido.');
  return new URL('/?oauth=google', origin).href;
}
