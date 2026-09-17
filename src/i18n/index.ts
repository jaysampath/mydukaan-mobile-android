import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';

import en from './en.json';

/**
 * Localisation.
 *
 * English only at launch, per the locked product decisions -- but every string
 * goes through `t()` from the first screen. Retrofitting string extraction
 * across thirty screens is the work everyone defers and nobody does, and the
 * cost of doing it now is a function call.
 *
 * The device locale is read and recorded but NOT honoured yet: falling back to
 * an untranslated key on a Hindi phone is worse than showing English. When a
 * second catalogue exists, delete the forced locale below and the app becomes
 * bilingual without a screen audit.
 */
export const i18n = new I18n({ en });

i18n.defaultLocale = 'en';
i18n.locale = 'en';
i18n.enableFallback = true;

/** What the phone is actually set to. Useful for deciding what to translate next. */
export const deviceLocale = getLocales()[0]?.languageTag ?? 'unknown';

/**
 * Translate. Interpolation uses {{name}}:
 *
 *   t('orders.orderNo', { no: 41 })  ->  "Order #41"
 */
export function t(key: string, params?: Record<string, unknown>): string {
  return i18n.t(key, params);
}
