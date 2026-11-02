import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { authReturnInfo, googleRedirectUrl, oauthErrorMessage } from '../src/lib/remote/oauth';
import { googleSignInUrl } from '../src/lib/remote/auth';
import { RemoteConnectionError } from '../src/lib/remote/errors';

test('Google returns only to the initiating app origin, including local development', () => {
  assert.equal(googleRedirectUrl('https://cheesit-entrenos.vercel.app'), 'https://cheesit-entrenos.vercel.app/?oauth=google');
  assert.equal(googleRedirectUrl('http://localhost:3000'), 'http://localhost:3000/?oauth=google');
  for (const unsafe of ['http://example.com', 'https://example.com/path', 'https://example.com/?next=https://evil.test', 'https://user:password@example.com']) assert.throws(() => googleRedirectUrl(unsafe));
});

test('provider cancellations and failures are safe readable messages, without exposing provider details', () => {
  assert.match(oauthErrorMessage('access_denied'), /cancelado/);
  const returned = authReturnInfo('https://cheesit.test/?oauth=google#error=access_denied&error_description=PRIVATE&access_token=SECRET');
  assert.deepEqual(returned, { google: true, recovery: false, error: 'access_denied' });
  assert.doesNotMatch(JSON.stringify(returned), /PRIVATE|SECRET/);
  assert.match(oauthErrorMessage('flow_state_expired'), /caducado/);
  assert.doesNotMatch(oauthErrorMessage('<script>private</script>'), /script|private/);
  assert.equal(authReturnInfo('https://cheesit.test/?recovery=1#type=recovery').recovery, true);
});

test('real Supabase SDK builds minimal Google OAuth; disabled providers and lost network stay in the app', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://cheesit-test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_google_test';
  let enabled = false;
  let offline = false;
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    assert.equal(String(url), 'https://cheesit-test.supabase.co/auth/v1/settings');
    if (offline) throw new TypeError('Failed to fetch');
    return Response.json({ external: { google: enabled } });
  });
  try {
    const callback = googleRedirectUrl('http://localhost:3000');
    await assert.rejects(googleSignInUrl(callback), /aún no está disponible/);
    enabled = true;
    const url = new URL(await googleSignInUrl(callback));
    assert.equal(url.origin, 'https://cheesit-test.supabase.co');
    assert.equal(url.pathname, '/auth/v1/authorize');
    assert.equal(url.searchParams.get('provider'), 'google');
    assert.equal(url.searchParams.get('redirect_to'), callback);
    assert.equal(url.searchParams.get('scopes'), 'openid email profile');
    assert.equal(url.searchParams.get('prompt'), 'select_account');
    assert.equal(url.searchParams.has('access_type'), false);
    offline = true;
    await assert.rejects(googleSignInUrl(callback), RemoteConnectionError);
  } finally { fetchMock.mock.restore(); }
});
