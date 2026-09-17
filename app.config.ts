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
 * baked in from .env.<env> at build time. See mydukaan-backend/docs/supabase-access.md.
 */
type AppEnv = 'dev' | 'prod';

const APP_ENV = (process.env.APP_ENV ?? 'dev') as AppEnv;

if (APP_ENV !== 'dev' && APP_ENV !== 'prod') {
  throw new Error(`APP_ENV must be "dev" or "prod", got "${APP_ENV}"`);
}

/**
 * How a user proves who they are.
 *
 *   password  email + password. What works today.
 *   otp       phone + SMS code. The intended method for this market, blocked
 *             on TRAI DLT entity registration plus sender-ID and template
 *             approval -- weeks of calendar time, and not yet started.
 *
 * The sign-in screen renders from this flag and drives one of two strategy
 * modules behind a single interface, so switching is a flag change plus
 * enabling the provider on the Supabase project, not a screen rewrite.
 *
 * Baked in at build time like APP_ENV: which credentials the app accepts is not
 * something a running app should be able to change its mind about.
 */
type AuthMode = 'password' | 'otp';

const AUTH_MODE = (process.env.AUTH_MODE ?? 'password') as AuthMode;

if (AUTH_MODE !== 'password' && AUTH_MODE !== 'otp') {
  throw new Error(`AUTH_MODE must be "password" or "otp", got "${AUTH_MODE}"`);
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
  // Deliberately light-only. This app is used outdoors in bright sun on cheap
  // screens; a high-contrast light theme is the one that has to work, and a
  // second theme doubles the contrast audit for no user benefit in V1.
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

  // Typed routes: expo-router generates route types into .expo/types, so a
  // router.push to a path that does not exist fails at typecheck rather than at
  // runtime on someone's phone.
  experiments: {
    typedRoutes: true,
  },

  plugins: [
    'expo-router',
    [
      'expo-build-properties',
      {
        android: {
          // The kotlinVersion pin that used to live here existed only for
          // WatermelonDB's Kotlin JSI bridge, which is gone. See ADR 0003.
          minSdkVersion: 24,
        },
        ios: {
          deploymentTarget: '15.1',
        },
      },
    ],
    'expo-localization',
    'expo-secure-store',
  ],

  extra: {
    appEnv: APP_ENV,
    supabaseUrl: SUPABASE_URL,
    supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY,
    authMode: AUTH_MODE,
  },
});
