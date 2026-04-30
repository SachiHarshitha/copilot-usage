import { test } from 'node:test';
import assert from 'node:assert/strict';

import { _resetMailTemplates, getMailTemplate, registerMailTemplate } from '../templates';
import { adminLockoutTemplate, adminNewIpTemplate, registerAdminTemplates } from './admin';

function freshRegistry(): void {
  _resetMailTemplates();
  registerAdminTemplates();
}

test('admin-lockout renders subject, text, and html with the supplied vars', () => {
  freshRegistry();
  const t = getMailTemplate('admin-lockout');
  const out = t.render({ who: 'Alex', unlocksAt: '2025-01-01T12:30:00Z', duration: '30 minutes' });
  assert.match(out.subject, /admin account locked/i);
  assert.match(out.text, /Alex/);
  assert.match(out.text, /30 minutes/);
  assert.match(out.text, /2025-01-01T12:30:00Z/);
  assert.match(out.html, /<strong>30 minutes<\/strong>/);
});

test('admin-lockout escapes HTML in user-supplied vars (XSS defense)', () => {
  freshRegistry();
  const out = adminLockoutTemplate.render({
    who: '<script>alert(1)</script>',
    unlocksAt: 't',
    duration: 'd',
  });
  assert.equal(out.html.includes('<script>'), false);
  assert.match(out.html, /&lt;script&gt;/);
});

test('admin-login-from-new-ip renders the network fingerprint and timestamp', () => {
  freshRegistry();
  const out = adminNewIpTemplate.render({
    who: 'B',
    loginAt: '2025-02-02T03:04:05Z',
    ipHashShort: 'abc123def456',
  });
  assert.match(out.subject, /unrecognized network/i);
  assert.match(out.text, /abc123def456/);
  assert.match(out.html, /abc123def456/);
});

test('registry rejects duplicate ids (defends against double-registration on hot reload)', () => {
  _resetMailTemplates();
  registerMailTemplate({ id: 'dup', render: () => ({ subject: 's', text: 't', html: 'h' }) });
  assert.throws(
    () => registerMailTemplate({ id: 'dup', render: () => ({ subject: 's', text: 't', html: 'h' }) }),
    /registered twice/,
  );
});
