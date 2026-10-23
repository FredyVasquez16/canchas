import { buildApp } from './app.ts';
import { openDatabase } from './db/index.ts';
import { seedCourts } from './seed.ts';

const port = Number(process.env.PORT ?? 3000);
const databasePath = process.env.DATABASE_PATH ?? './data/canchas.sqlite';

const db = openDatabase(databasePath);
seedCourts(db, Date.now());

const app = buildApp({ db }, { logger: true });

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`booking api listening on http://localhost:${port} (db: ${databasePath})`);
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exitCode = 1;
  });
