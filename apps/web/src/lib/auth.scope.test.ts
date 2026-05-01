import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Phase 1d — guard against a regression that would silently re-enable the
 * `user:email` (or any other) GitHub OAuth scope. The provider must request
 * exactly `read:user`.
 */

test('GitHub provider requests only the read:user scope', async () => {
  process.env.GITHUB_CLIENT_ID ??= 'test-client-id';
  process.env.GITHUB_CLIENT_SECRET ??= 'test-client-secret';
  process.env.NEXTAUTH_SECRET ??= 'test-nextauth-secret';

  const mod = await import('./auth');
  const provider = mod.authOptions.providers.find(
    (p): p is typeof p & { id: string; authorization?: unknown } =>
      typeof p === 'object' && p !== null && 'id' in p && (p as { id: string }).id === 'github',
  );
  assert.ok(provider, 'github provider must be configured');

  // next-auth's GitHubProvider stores the unmodified default
  // (`read:user user:email`) on `provider.authorization` and our caller-side
  // override on `provider.options.authorization`. The runtime merger lets the
  // override win at request time, so we assert on the override here.
  const overrides = (provider as { options?: { authorization?: { params?: { scope?: string } } } })
    .options?.authorization;
  assert.ok(
    overrides && overrides.params && typeof overrides.params.scope === 'string',
    'must override authorization.params.scope',
  );
  const scope = overrides.params!.scope!;

  assert.equal(scope, 'read:user', `scope must be exactly "read:user" — got "${scope}"`);
  assert.equal(scope.includes('user:email'), false);
  assert.equal(scope.includes('repo'), false);
  assert.equal(scope.includes('workflow'), false);
  assert.equal(scope.includes('admin:'), false);
});
