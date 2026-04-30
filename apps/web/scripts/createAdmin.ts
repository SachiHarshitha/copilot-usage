#!/usr/bin/env node
/**
 * Bootstrap CLI to create the first admin operator.
 *
 *   pnpm --filter web admin:create
 *
 * Refuses to run in production unless ADMIN_BOOTSTRAP_ALLOWED=true. Prompts
 * for email + password (twice, never echoed) and prints the otpauth URI plus
 * 10 recovery codes exactly once. The displayed secrets must be copied to a
 * password manager immediately — they are not retrievable afterwards.
 */
import { createInterface } from 'node:readline/promises';

import { PrismaClient } from '@prisma/client';

import { ADMIN_TOTP_ISSUER, provisionAdmin } from '../src/lib/admin/provisioning';

const FORCE_FLAG = '--force';
const ROLE_FLAG = '--role=';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes(FORCE_FLAG);
  const roleArg = args.find((a) => a.startsWith(ROLE_FLAG))?.slice(ROLE_FLAG.length);
  const role = (roleArg as 'READ_ONLY' | 'MODERATOR' | 'ADMIN' | undefined) ?? 'ADMIN';

  if (process.env.NODE_ENV === 'production' && process.env.ADMIN_BOOTSTRAP_ALLOWED !== 'true') {
    console.error(
      'Refusing to run in production without ADMIN_BOOTSTRAP_ALLOWED=true. Set it explicitly on the VPS shell only.',
    );
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    const adminCount = await prisma.adminUser.count();
    if (adminCount > 0 && !force) {
      console.error(
        `An admin already exists (count=${adminCount}). Re-run with ${FORCE_FLAG} to add another.`,
      );
      process.exit(2);
    }

    const email = await promptLine('Admin email: ');
    const password = await promptSecret('Password (min 12 chars, mixed classes): ');
    const confirm = await promptSecret('Confirm password: ');
    if (password !== confirm) {
      console.error('Passwords do not match.');
      process.exit(1);
    }

    const result = await provisionAdmin(prisma, { email, password, role });

    console.log('');
    console.log('Admin created successfully.');
    console.log(`  id:    ${result.adminUser.id}`);
    console.log(`  email: ${result.adminUser.email}`);
    console.log(`  role:  ${result.adminUser.role}`);
    console.log('');
    console.log('Scan this URI with an authenticator app (issuer shown as');
    console.log(`"${ADMIN_TOTP_ISSUER}"). It is shown ONCE and not stored in plaintext:`);
    console.log('');
    console.log(`  ${result.otpauthUri}`);
    console.log('');
    console.log('If your authenticator cannot scan a URI, enter this base32 secret manually:');
    console.log('');
    console.log(`  ${result.totpSecret}`);
    console.log('');
    console.log('Recovery codes (each works ONCE — store in a password manager now):');
    for (const code of result.recoveryCodes) {
      console.log(`  ${code}`);
    }
    console.log('');
    console.log('Sign in at /admin/login. The first login uses the TOTP code above.');
  } finally {
    await prisma.$disconnect();
  }
}

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

/**
 * Read a line from stdin without echoing characters back (best effort — falls
 * back to plain readline when the input is not a TTY, e.g. CI).
 */
async function promptSecret(question: string): Promise<string> {
  const stdin = process.stdin as NodeJS.ReadStream & { isRaw?: boolean };
  if (!stdin.isTTY) {
    return promptLine(question);
  }

  process.stdout.write(question);
  const wasRaw = stdin.isRaw === true;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return new Promise<string>((resolve, reject) => {
    let buffer = '';
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === '\n' || ch === '\r' || ch === '\u0004') {
          stdin.setRawMode(wasRaw);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(buffer);
          return;
        }
        if (ch === '\u0003') {
          // Ctrl-C
          stdin.setRawMode(wasRaw);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          reject(new Error('Aborted'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          // Backspace
          buffer = buffer.slice(0, -1);
          continue;
        }
        buffer += ch;
      }
    };
    stdin.on('data', onData);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
