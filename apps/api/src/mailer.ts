import type { Mailer } from './jobs.ts';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * S15: development mailer that logs one line per message, so the job runs without an
 * email provider configured. A real provider is out of scope for now.
 */
export class ConsoleMailer implements Mailer {
  send(message: MailMessage): void {
    const text = message.text.replace(/\n/g, ' | ');
    console.log(`[mail] to=${message.to} subject="${message.subject}" text="${text}"`);
  }
}
