import { buildApp } from './app.ts';
import { cookieSecure, reminderIntervalMs } from './config.ts';
import { openDatabase } from './db/index.ts';
import { googleConfigFromEnv } from './google.ts';
import { createMailer } from './mailer.ts';
import { startScheduler } from './scheduler.ts';
import { seedCourts } from './seed.ts';

const port = Number(process.env.PORT ?? 3000);
const databasePath = process.env.DATABASE_PATH ?? './data/canchas.sqlite';
const schedulerIntervalMs = reminderIntervalMs(process.env);

const db = openDatabase(databasePath);
seedCourts(db, Date.now());

// S24: choose the mail channel once and report it, never the credentials themselves.
const { mailer, status } = createMailer(process.env);

// S36: Google sign-in only exists when the venue supplied its own OAuth client.
const google = googleConfigFromEnv(process.env);

const app = buildApp(
  {
    db,
    mailer,
    google,
    webBaseUrl: process.env.WEB_BASE_URL,
    mailTransport: status.transport,
    cookieSecure: cookieSecure(process.env),
  },
  { logger: true },
);

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`booking api listening on http://localhost:${port} (db: ${databasePath})`);
    app.log.info(
      `reminder mail transport: ${status.transport} from=${status.from || '(unset)'} every ${schedulerIntervalMs} ms` +
        (status.missing.length > 0 ? ` missing=${status.missing.join(',')}` : ''),
    );
    app.log.info(`google sign-in: ${google ? `on (redirect ${google.redirectUri})` : 'off'}`);
    if (status.transport === 'console') {
      // S35: say it once and loudly, so nobody waits for an email that never leaves.
      app.log.warn(
        'mail is NOT leaving this process: recovery links and reminders are printed to this log' +
          (status.missing.length > 0 ? ` (missing ${status.missing.join(', ')})` : ''),
      );
    }

    // S24: reminders run inside this process, so nobody has to launch a command.
    const stopScheduler = startScheduler({
      db,
      mailer,
      intervalMs: schedulerIntervalMs,
      onResult: (result) => app.log.info({ job: result }, 'scheduled maintenance pass finished'),
      onError: (error) => app.log.error(error, 'scheduled maintenance pass failed'),
    });

    let shuttingDown = false;
    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      app.log.info(`received ${signal}, stopping reminders and closing the api`);
      stopScheduler();
      try {
        await app.close();
      } finally {
        db.close();
      }
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exitCode = 1;
  });
