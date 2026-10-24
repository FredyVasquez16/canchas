import { createTransport, type Transporter } from 'nodemailer';
import type { Mailer } from './jobs.ts';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** S24: what the API should say about the mail channel at startup, never the secret itself. */
export interface MailerStatus {
  transport: 'smtp' | 'console';
  from: string;
  missing: string[];
}

/** S24: every name that must be present before mail can actually leave the process. */
const SMTP_REQUIRED_VARIABLES = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'] as const;

const DEFAULT_SMTP_PORT = 587;

/**
 * S24: fallback mailer that logs one line per message, so the job runs without an
 * email provider configured.
 */
export class ConsoleMailer implements Mailer {
  send(message: MailMessage): void {
    const text = message.text.replace(/\n/g, ' | ');
    console.log(`[mail] to=${message.to} subject="${message.subject}" text="${text}"`);
  }
}

/** S24: real outgoing mail through the configured SMTP server. */
export class SmtpMailer implements Mailer {
  constructor(
    private readonly transporter: Transporter,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

function smtpPort(rawValue: string | undefined): number {
  const parsed = Number(rawValue?.trim() ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SMTP_PORT;
}

/**
 * S24: pick the mail channel from the environment. All four settings must be present;
 * otherwise the message stays in the log and the missing names are reported.
 */
export function createMailer(env: NodeJS.ProcessEnv): { mailer: Mailer; status: MailerStatus } {
  const missing = SMTP_REQUIRED_VARIABLES.filter((name) => (env[name] ?? '').trim() === '');
  const from = (env.MAIL_FROM ?? '').trim();

  if (missing.length > 0) {
    return { mailer: new ConsoleMailer(), status: { transport: 'console', from, missing } };
  }

  const transporter = createTransport({
    host: env.SMTP_HOST?.trim(),
    port: smtpPort(env.SMTP_PORT),
    secure: (env.SMTP_SECURE ?? '').trim().toLowerCase() === 'true',
    auth: { user: env.SMTP_USER?.trim(), pass: env.SMTP_PASS },
  });

  return { mailer: new SmtpMailer(transporter, from), status: { transport: 'smtp', from, missing: [] } };
}
