import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { setGenerator } from '@nozbe/watermelondb/utils/common/randomId';
import * as Crypto from 'expo-crypto';

import { schema } from './schema';
import { modelClasses } from './models';
import { migrations } from './migrations';

/**
 * Record ids are UUID v4, generated on the device.
 *
 * WatermelonDB's default generator produces short random strings. We override
 * it because the server's primary keys are `uuid`, and because a device that is
 * offline for a week must be able to mint ids that will not collide with ids
 * minted by the other four phones in the shop over the same week. UUID v4 gives
 * that for free; the default generator's 16 characters do not give the same
 * guarantee at the scale of a multi-tenant deployment.
 *
 * expo-crypto is backed by the platform CSPRNG on both iOS and Android.
 */
setGenerator(() => Crypto.randomUUID());

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  // JSI keeps SQLite calls off the bridge. On the budget Android hardware this
  // app targets, that is the difference between a list that scrolls and one
  // that stutters.
  jsi: true,
  dbName: 'mydukaan',
  onSetUpError: (error) => {
    // Reaching here means the local database could not be opened at all. The
    // app must surface this rather than silently running with no storage,
    // because "no storage" for an offline-first app means silent data loss.
    console.error('[db] WatermelonDB failed to initialise', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses,
});

export * from './models';
export { schema, SCHEMA_VERSION } from './schema';
