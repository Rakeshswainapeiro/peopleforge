export { createDatabase, type DatabaseHandle, type DatabaseOptions } from './database.js';
export { createEntityDirectory, type EntityDirectory, type EntitySummary } from './directory.js';
export {
  createFieldCipher,
  FieldCryptoError,
  parseKeyRing,
  type FieldCipher,
  type FieldContext,
  type KeyRing,
} from './field-crypto.js';
export {
  listMigrations,
  MigrationError,
  runMigrations,
  type MigrationCommand,
  type MigrationOptions,
} from './migrator.js';
export type { Database, LocalisedText } from './schema.js';
export { ScopeError, withScope, type Scope } from './scope.js';
export { SEED_ASSIGNMENTS, SEED_ENTITIES, SeedRefusedError, seedDevelopmentData } from './seed.js';
