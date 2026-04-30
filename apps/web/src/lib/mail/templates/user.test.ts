import { test } from 'node:test';
import assert from 'node:assert/strict';

import { _resetMailTemplates } from '../templates';
import {
  accountSuspendedTemplate,
  deviceRevokedTemplate,
  registerUserTemplates,
} from './user';

function freshRegistry(): void {
  _resetMailTemplates();
  registerUserTemplates();
}

test('account-suspended renders subject, body, and includes appeal URL', () => {
  freshRegistry();
  const out = accountSuspendedTemplate.render({
    who: 'sam',
    appealUrl: 'https://promptstreak.dev/account',
  });
  assert.match(out.subject, /suspended/i);
  assert.match(out.text, /sam/);
  assert.match(out.text, /https:\/\/promptstreak\.dev\/account/);
  assert.match(out.html, /href="https:\/\/promptstreak\.dev\/account"/);
});

test('account-suspended escapes HTML in user-supplied vars', () => {
  freshRegistry();
  const out = accountSuspendedTemplate.render({
    who: '<img src=x onerror=alert(1)>',
    appealUrl: 'https://promptstreak.dev/x',
  });
  assert.equal(out.html.includes('<img'), false);
  assert.match(out.html, /&lt;img/);
});

test('device-revoked includes the device fingerprint and reconnect URL', () => {
  freshRegistry();
  const out = deviceRevokedTemplate.render({
    who: 'pat',
    deviceFingerprint: 'a1b2',
    reconnectUrl: 'https://promptstreak.dev/connect',
  });
  assert.match(out.subject, /revoked/i);
  assert.match(out.text, /a1b2/);
  assert.match(out.html, /<code>a1b2<\/code>/);
  assert.match(out.html, /href="https:\/\/promptstreak\.dev\/connect"/);
});

test('href URLs other than http(s) collapse to about:blank (no javascript: URIs)', () => {
  freshRegistry();
  const out = deviceRevokedTemplate.render({
    who: 'p',
    deviceFingerprint: '0000',
    // eslint-disable-next-line no-script-url
    reconnectUrl: 'javascript:alert(1)',
  });
  assert.match(out.html, /href="about:blank"/);
  assert.equal(out.html.includes('javascript:'), false);
});
