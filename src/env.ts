import Constants from 'expo-constants';

/**
 * Build-time configuration, read once.
 *
 * These values come from app.config.ts, which reads .env.<APP_ENV> during the
 * build. They cannot change at runtime -- that is the point. A production build
 * has no code path that reaches the dev project.
 */
type AppEnv = 'dev' | 'prod';

/**
 * Which credentials the sign-in screen asks for. See app.config.ts.
 *
 * `password` is what works today. `otp` is the intended method for this market
 * and is blocked on TRAI DLT registration, so the screen is built to switch on
 * this flag rather than being rewritten later.
 */
export type AuthMode = 'password' | 'otp';

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
  authMode: required('authMode', extra.authMode) as AuthMode,
};

export const isDev = env.appEnv === 'dev';
