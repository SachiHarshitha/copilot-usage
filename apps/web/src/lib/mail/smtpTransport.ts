import nodemailer from 'nodemailer';

import type { MailTransporter } from './smtpMailService';
import type { SmtpConfig } from './smtpConfig';

/**
 * Build a real `nodemailer` transporter from resolved SMTP config. Verifies
 * the upstream certificate (no `rejectUnauthorized: false`); a
 * misconfigured server should fail loudly so we notice rather than silently
 * downgrading mail to plaintext.
 */
export function createSmtpTransporter(config: SmtpConfig): MailTransporter {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  });

  return {
    async sendMail(opts) {
      const result = await transport.sendMail(opts);
      return { messageId: result.messageId };
    },
  };
}
