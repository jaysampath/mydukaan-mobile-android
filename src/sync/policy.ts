/**
 * The decisions the sync cycle makes, separated from the machinery that
 * executes them.
 *
 * Nothing here imports WatermelonDB, NetInfo or expo-constants, which is the
 * point: these are the parts worth testing, and the React Native module graph
 * cannot be loaded in a Node test runner. sync.ts holds the side effects; this
 * holds the rules.
 */

/**
 * Thrown when the server's schema has moved beyond what this build understands.
 *
 * Sync stops rather than continuing, because the alternative is writing rows
 * this build cannot represent into local storage and corrupting it. The only
 * fix is a new app version, so this has to reach the user as an update prompt;
 * retrying silently forever would look like an app that simply does not work.
 */
export class SchemaOutdatedError extends Error {
  constructor(
    readonly requiredContract: number,
    readonly buildContract: number,
  ) {
    super(
      `This version of the app is too old to sync (server requires schema ` +
        `${requiredContract}, this build has ${buildContract}). Please update.`,
    );
    this.name = 'SchemaOutdatedError';
  }
}

/**
 * Thrown when local changes exist while offline writes are off.
 *
 * Nothing should write to local SQLite outside the sync applier in pull_only
 * mode. If something did, discarding it silently would lose the user's work
 * with no trace, so we fail loudly instead. Hitting this means a screen is
 * calling database.write() where it should call an RPC in src/api/writes.ts.
 */
export class UnexpectedLocalChangesError extends Error {
  constructor(readonly tables: string[]) {
    super(
      `SYNC_MODE=pull_only but local changes exist in: ${tables.join(', ')}. ` +
        `Writes must go through src/api/writes.ts, not database.write().`,
    );
    this.name = 'UnexpectedLocalChangesError';
  }
}

/** Names of the tables in a change set that actually carry something. */
export function nonEmptyTables(changes: Record<string, unknown>): string[] {
  return Object.entries(changes)
    .filter(([, set]) => {
      const c = set as { created: unknown[]; updated: unknown[]; deleted: string[] };
      return c.created.length > 0 || c.updated.length > 0 || c.deleted.length > 0;
    })
    .map(([table]) => table);
}

/**
 * Whether a server contract permits this build to sync.
 *
 * A server older than migration 0009 sends no contract at all; that is the
 * pre-contract world and counts as compatible -- refusing it would strand every
 * device the moment the check shipped. Only `min_client` gates: a higher
 * `current` is an additive change this build can safely ignore.
 */
export function contractPermitsSync(
  serverMinClient: number | undefined,
  buildContract: number,
): boolean {
  return serverMinClient === undefined || serverMinClient <= buildContract;
}
