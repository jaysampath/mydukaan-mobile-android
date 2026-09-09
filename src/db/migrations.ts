import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

/**
 * Local schema migrations.
 *
 * Empty at version 1, but wired up from the start on purpose: an offline-first
 * app cannot assume users update promptly. A phone that has been offline for
 * three weeks comes back with an old local schema and unsynced rows in it, and
 * WatermelonDB needs a migration path to keep those rows rather than wiping the
 * database. Adding this later, after the first release, is not possible.
 *
 * When adding a column: bump SCHEMA_VERSION in schema.ts and add a
 * `{ toVersion, steps: [addColumns({...})] }` entry here.
 */
export const migrations = schemaMigrations({
  migrations: [],
});
