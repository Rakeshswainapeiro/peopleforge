// CLI: node dist/cli/seed.js — synthetic dev/test data. Refuses outside APP_ENV dev/test.
import { createFieldCipher, parseKeyRing } from '../field-crypto.js';
import { seedDevelopmentData } from '../seed.js';

const env = process.env;
const values = new Map(Object.entries(env));
const missing = [
  'APP_ENV',
  'DATABASE_OWNER_URL',
  'DATA_ENCRYPTION_KEYS',
  'DATA_ENCRYPTION_ACTIVE_KEY',
].filter((key) => (values.get(key) ?? '') === '');
if (missing.length > 0) {
  process.stderr.write(`Missing environment variables: ${missing.join(', ')}\n`);
  process.exit(1);
}

await seedDevelopmentData({
  connectionString: String(env.DATABASE_OWNER_URL),
  appEnv: String(env.APP_ENV),
  cipher: createFieldCipher(
    parseKeyRing(String(env.DATA_ENCRYPTION_KEYS), String(env.DATA_ENCRYPTION_ACTIVE_KEY)),
  ),
});
process.stdout.write('Seeded synthetic subsidiaries, assignments and employees.\n');
