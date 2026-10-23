import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hashPassword } from './auth.ts';
import { openDatabase } from './db/index.ts';
import { createUser, findUserByEmail } from './db/users.ts';
import { isValidHonduranPhone } from './phone.ts';

/**
 * Creates the first owner account. Idempotent by email, so it is safe to rerun.
 * Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_PHONE=... npm run create-admin -w @canchas/api
 */
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME ?? 'Dueño';
const phone = process.env.ADMIN_PHONE;
const databasePath = process.env.DATABASE_PATH ?? './data/canchas.sqlite';

if (!email || !password || !phone) {
  console.error(
    'Faltan datos. Usa ADMIN_EMAIL, ADMIN_PASSWORD y ADMIN_PHONE. La contraseña necesita 8 caracteres o más.',
  );
  process.exit(1);
}
if (password.length < 8) {
  console.error('La contraseña necesita 8 caracteres o más.');
  process.exit(1);
}
if (!isValidHonduranPhone(phone)) {
  console.error('El teléfono debe tener 8 dígitos (Honduras), por ejemplo 9999-8888.');
  process.exit(1);
}

mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = openDatabase(databasePath);

try {
  const existing = findUserByEmail(db, email);
  if (existing) {
    console.log(JSON.stringify({ created: false, email: existing.email, role: existing.role }));
  } else {
    const user = createUser(db, {
      email,
      passwordHash: hashPassword(password),
      name,
      phone,
      role: 'admin',
      now: Date.now(),
    });
    console.log(JSON.stringify({ created: true, email: user.email, role: user.role }));
  }
} finally {
  db.close();
}
