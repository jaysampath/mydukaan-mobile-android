import brandingJson from './branding.json';

/**
 * Single source of truth for anything brand-shaped.
 *
 * "My Dukaan" is a working name. Nothing outside branding.json should contain
 * the product name, colours, or store identifiers -- rebranding should be an
 * edit to that one file and nowhere else.
 *
 * The values live in JSON rather than TypeScript because app.config.ts also
 * needs them, and Expo's config evaluator transpiles that file in isolation --
 * it cannot resolve a relative `.ts` import. JSON is the one format both the
 * Expo CLI and the app bundler read the same way.
 *
 * The one value you cannot change later is `bundleId`: once an app is published
 * to the Play Store or App Store the identifier is permanent. Settle it before
 * the first store upload, not after.
 */
export const branding = brandingJson;

export type Branding = typeof branding;
export type BrandColors = Branding['colors'];
