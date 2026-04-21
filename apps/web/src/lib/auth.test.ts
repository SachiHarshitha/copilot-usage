import assert from 'node:assert/strict';
import test from 'node:test';

import { authOptions } from './auth';

test('auth signIn page is not configured to an API auth endpoint', () => {
  const signInPage = authOptions.pages?.signIn;
  assert.equal(typeof signInPage === 'string' && signInPage.startsWith('/api/auth/'), false);
});
