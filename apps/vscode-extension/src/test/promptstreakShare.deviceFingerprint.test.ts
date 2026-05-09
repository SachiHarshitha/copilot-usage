import * as assert from 'assert';
import { createHash } from 'crypto';
import { buildDeviceFingerprint } from '../features/promptstreakShare/deviceFingerprint';

suite('PromptStreak Share: device fingerprint', () => {
  test('buildDeviceFingerprint hashes machineId with namespace', () => {
    const machineId = 'machine-123';
    const expected = createHash('sha256')
      .update('promptstreak:v1:')
      .update(machineId)
      .digest('hex');

    assert.strictEqual(buildDeviceFingerprint(machineId), expected);
  });

  test('buildDeviceFingerprint is deterministic and lowercase hex', () => {
    const a = buildDeviceFingerprint('same-machine');
    const b = buildDeviceFingerprint('same-machine');

    assert.strictEqual(a, b);
    assert.ok(/^[a-f0-9]{64}$/.test(a));
  });
});
