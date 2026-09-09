import { addColumns, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

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
  migrations: [
    {
      // businesses.features -- the per-business module toggles, e.g. the
      // packing module. The server had always sent this column; the device
      // simply never stored it, so the app could not read its own feature
      // flags. Caught by src/db/schema.contract.test.ts.
      toVersion: 2,
      steps: [
        addColumns({
          table: 'businesses',
          columns: [{ name: 'features', type: 'string' }],
        }),
      ],
    },
  ],
});
