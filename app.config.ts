import { config as loadEnv } from 'dotenv';
import type { ExpoConfig, ConfigContext } from 'expo/config';
// Read the JSON directly: Expo's config evaluator transpiles this file on its
// own and cannot resolve a relative .ts import. See branding.config.ts.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const branding = require('./branding.json') as typeof import('./branding.json');

// Load .env.<APP_ENV> ourselves rather than relying on the caller to pass
// --env-file. Every Expo CLI command evaluates this file, and a config that
// only works when invoked one particular way is a config that will be invoked
// the other way at some point.
loadEnv({ path: `.env.${process.env.APP_ENV ?? 'dev'}` });

/**
 * Build-time environment selection.
 *
 * APP_ENV picks which Supabase project the binary talks to. There is no runtime
 * switch and no way to point a production build at dev: the URL and key are
 * baked in from .env.<env> at build time. See /docs/supabase-access.md.
 */
type AppEnv = 'dev' | 'prod';

const APP_ENV = (process.env.APP_ENV ?? 'dev') as AppEnv;

if (APP_ENV !== 'dev' && APP_ENV !== 'prod') {
  throw new Error(`APP_ENV must be "dev" or "prod", got "${APP_ENV}"`);
}

/**
 * Offline writes are behind this flag.
 *
 *   pull_only  reads come from local SQLite, kept fresh by sync_pull; every
 *              write goes through an online RPC. The client never calls
 *              sync_push, so the server is the only writer and its invariants
 *              cannot be bypassed.
 *   full       WatermelonDB pushes local writes. Requires src/domain (the
 *              platform-agnostic mirror of the write rules) and the sync_push
 *              re-derive fix first -- see docs/adr/0002-sync-mode-flag.md.
 *
 * Baked in at build time like APP_ENV: which writes are possible is not
 * something a running app should be able to change its mind about.
 */
type SyncMode = 'pull_only' | 'full';

const SYNC_MODE = (process.env.SYNC_MODE ?? 'pull_only') as SyncMode;

if (SYNC_MODE !== 'pull_only' && SYNC_MODE !== 'full') {
  throw new Error(`SYNC_MODE must be "pull_only" or "full", got "${SYNC_MODE}"`);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    `Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY for APP_ENV=${APP_ENV}.\n` +
      `Load them from .env.${APP_ENV} -- see /docs/build-and-release.md.`,
  );
}

// Dev and prod are separate installable apps, so both can sit on one phone and
// there is never any doubt about which one you are looking at.
const isDev = APP_ENV === 'dev';
const name = isDev ? `${branding.displayName} (dev)` : branding.displayName;
const bundleId = isDev ? `${branding.bundleId}.dev` : branding.bundleId;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name,
  slug: branding.slug,
  scheme: branding.scheme,
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  assetBundlePatterns: ['**/*'],

  ios: {
    supportsTablet: false,
    bundleIdentifier: bundleId,
  },

  android: {
    package: bundleId,
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: branding.colors.background,
    },
    edgeToEdgeEnabled: true,
  },

  plugins: [
    // WatermelonDB needs native changes on both platforms (JSI bridge on
    // Android, the SQLite pod on iOS). This plugin makes them part of prebuild
    // so `expo prebuild --clean` stays reproducible.
    '@morrowdigital/watermelondb-expo-plugin',
    [
      'expo-build-properties',
      {
        android: {
          // WatermelonDB's Android bridge is Kotlin; pin it so a Gradle plugin
          // bump cannot silently change the toolchain under us.
          kotlinVersion: '2.0.21',
          minSdkVersion: 24,
        },
        ios: {
          deploymentTarget: '15.1',
        },
      },
    ],
    'expo-secure-store',
  ],

  extra: {
    appEnv: APP_ENV,
    supabaseUrl: SUPABASE_URL,
    supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY,
    syncMode: SYNC_MODE,
  },
});
