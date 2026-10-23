import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { openDatabase } from './db/index.ts';
import { runScheduledJob } from './jobs.ts';
import { ConsoleMailer } from './mailer.ts';

const databasePath = process.env.DATABASE_PATH ?? './data/canchas.sqlite';

mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = openDatabase(databasePath);

try {
  const result = await runScheduledJob(db, Date.now(), new ConsoleMailer());
  console.log(JSON.stringify(result));
} finally {
  db.close();
}
