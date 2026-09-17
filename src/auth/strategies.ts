import { auth } from '../api/supabase';
import { env } from '../env';

/**
 * How a user signs in.
 *
 * Two implementations behind one interface, chosen by the build-time AUTH_MODE
 * flag. The sign-in screen does not know which one it has, which is the point:
 * switching to phone/OTP once TRAI DLT registration completes is a flag change
 * plus enabling the provider on the Supabase project, not a screen rewrite.
 *
 * `otp` is real code rather than a comment promising it later -- it throws a
 * typed `not_configured` today because the provider is off, so the branch stays
 * honest and compiles.
 */

export class AuthNotConfiguredError extends Error {
  constructor() {
    super('SMS sign-in is not switched on yet.');
    this.name = 'AuthNotConfiguredError';
  }
}

export interface AuthStrategy {
  /** What the first field asks for. */
  kind: 'password' | 'otp';
  /**
   * Password mode: signs in and resolves `{ done: true }`.
   * OTP mode: sends the code and resolves `{ done: false }` -- the screen then
   * collects the code and calls `verify`.
   */
  start(identifier: string, secret?: string): Promise<{ done: boolean }>;
  verify(identifier: string, code: string): Promise<{ done: boolean }>;
}

const password: AuthStrategy = {
  kind: 'password',
  async start(email, pw) {
    const { error } = await auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: pw ?? '',
    });
    if (error) throw error;
    return { done: true };
  },
  async verify() {
    // Nothing to verify: the password grant either succeeded or threw.
    return { done: true };
  },
};

const otp: AuthStrategy = {
  kind: 'otp',
  async start(phone) {
    // Supabase needs the phone provider configured and an SMS vendor wired up;
    // in India that also needs DLT entity, sender-ID and template approval.
    const { error } = await auth.signInWithOtp({ phone: phone.trim() });
    if (error) throw new AuthNotConfiguredError();
    return { done: false };
  },
  async verify(phone, code) {
    const { error } = await auth.verifyOtp({ phone: phone.trim(), token: code.trim(), type: 'sms' });
    if (error) throw error;
    return { done: true };
  },
};

export const strategy: AuthStrategy = env.authMode === 'otp' ? otp : password;
