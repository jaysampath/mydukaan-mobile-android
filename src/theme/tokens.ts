import { branding } from '../../branding.config';

/**
 * The design tokens.
 *
 * Colours come from branding.json, which stays the single source for brand
 * identity. Scale does NOT: spacing, type and touch targets live here, because
 * they are accessibility decisions rather than brand ones. Rebranding should
 * stay a one-file edit; making the text bigger should not require touching the
 * brand file.
 *
 * Every number below is driven by one set of facts about the user: a budget
 * Android phone, often in direct sunlight, held by someone who is not
 * tech-savvy and may have flour on their hands.
 *
 * WCAG contrast, measured (not estimated) against background #FFFFFF and
 * surface #F6F7F5:
 *
 *   text    #12160F  18.30 / 17.03
 *   muted   #55606E   6.39 /  5.95
 *   primary #1F6F54   6.07 /  5.65
 *   danger  #B3261E   6.54 /  6.08
 *   warning #8A6100   5.54 /  5.16
 *
 * `muted` was #6B7280, which measured 4.50 on surface -- exactly at the AA
 * threshold, and "exactly at the threshold" in direct sun on a cheap screen
 * means unreadable. Darkened to #55606E. Re-measure if a colour changes; the
 * script is in the commit that introduced this comment.
 */

export const colors = {
  ...branding.colors,

  /**
   * Dispatch. Its own name even though it currently aliases `warning`.
   *
   * Dispatch is where stock actually leaves the building, it cannot be undone
   * (there is no reversal RPC), and it must not look like anything else. It is
   * deliberately NOT `danger` -- red means "something went wrong" everywhere
   * else in the app, and dispatching is not an error -- and not `primary`,
   * which is every ordinary confirm button. Named separately so it can diverge
   * later without a screen edit.
   */
  dispatch: branding.colors.warning,
} as const;

/** 4pt grid. Large enough steps that nothing needs a magic number. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/**
 * Type scale.
 *
 * Nothing below 13, and 13 only for genuinely non-essential metadata. The Phase
 * 0 screen used 12-14 for notes and captions, which is too small for this
 * audience and is the single most common failure mode of apps built for it.
 *
 * Money and quantities get `numeric`, which is larger AND tabular: a column of
 * amounts that does not align is a column nobody trusts.
 */
export const type = {
  display: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  title: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  heading: { fontSize: 19, fontWeight: '600' as const, lineHeight: 25 },
  body: { fontSize: 17, fontWeight: '400' as const, lineHeight: 24 },
  bodyStrong: { fontSize: 17, fontWeight: '600' as const, lineHeight: 24 },
  secondary: { fontSize: 15, fontWeight: '400' as const, lineHeight: 21 },
  meta: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  numeric: {
    fontSize: 22,
    fontWeight: '700' as const,
    lineHeight: 28,
    fontVariant: ['tabular-nums'] as const,
  },
  numericSmall: {
    fontSize: 17,
    fontWeight: '600' as const,
    lineHeight: 24,
    fontVariant: ['tabular-nums'] as const,
  },
} as const;

/**
 * Touch targets.
 *
 * Android's accessibility floor is 48dp, not iOS's 44 -- this app ships to
 * Android, so 48 is the minimum anything tappable may be.
 *
 * `irreversible` is 64 and is meant to be used alone on a screen, with nothing
 * tappable near it. Dispatch is the one action in this app that cannot be taken
 * back, and a mis-tap there costs a stock count.
 */
export const touch = {
  min: 48,
  row: 56,
  primary: 56,
  irreversible: 64,
} as const;

/** How long a destructive confirm stays disabled, to absorb a carried-over tap. */
export const CONFIRM_ARM_MS = 700;

export const theme = { colors, space, radius, type, touch } as const;

export type Theme = typeof theme;
