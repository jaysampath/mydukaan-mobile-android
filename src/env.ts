import Constants from 'expo-constants';

/**
 * Build-time configuration, read once.
 *
 * These values come from app.config.ts, which reads .env.<APP_ENV> during the
 * build. They cannot change at runtime -- that is the point. A production build
 * has no code path that reaches the dev project.
 */
type AppEnv = 'dev' | 'prod';

const extra = Constants.expoConfig?.extra ?? {};

function required(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `Config "${name}" is missing. The app was built without a complete ` +
        `.env file -- see /docs/build-and-release.md.`,
    );
  }
  return value;
}

export const env = {
  appEnv: required('appEnv', extra.appEnv) as AppEnv,
  supabaseUrl: required('supabaseUrl', extra.supabaseUrl),
  supabasePublishableKey: required('supabasePublishableKey', extra.supabasePublishableKey),
};

export const isDev = env.appEnv === 'dev';
