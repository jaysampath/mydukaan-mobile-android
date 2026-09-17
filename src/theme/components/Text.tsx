import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors, type as typeScale } from '../tokens';
import { formatMoney } from '../../format/money';
import { formatPackSize, formatPackedQty, formatQty, type BaseUnit, type ItemKind } from '../../format/qty';

type Variant = keyof typeof typeScale;
type Tone = 'default' | 'muted' | 'primary' | 'danger' | 'success' | 'warning' | 'onPrimary';

const TONES: Record<Tone, string> = {
  default: colors.text,
  muted: colors.muted,
  primary: colors.primary,
  danger: colors.danger,
  success: colors.success,
  warning: colors.warning,
  onPrimary: colors.onPrimary,
};

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
}

/**
 * All text goes through here.
 *
 * Not for tidiness: it is what keeps the type scale actually enforced. A screen
 * that reaches for a raw <Text fontSize={12}> is how an app for
 * non-tech-savvy users in bright sunlight ends up with unreadable captions.
 */
export function Text({ variant = 'body', tone = 'default', style, ...rest }: TextProps) {
  return (
    <RNText
      {...rest}
      style={[typeScale[variant] as TextStyle, { color: TONES[tone] }, style]}
    />
  );
}

/**
 * A rupee amount.
 *
 * Tabular by default so a column of amounts aligns. Never build a currency
 * string by hand -- Indian digit grouping is not the western one and
 * src/format/money.ts is the only place that knows the difference.
 */
export function Money({
  value,
  decimals,
  variant = 'numericSmall',
  tone,
  style,
}: {
  value: number | string | null | undefined;
  decimals?: number;
  variant?: Variant;
  tone?: Tone;
  style?: TextStyle;
}) {
  const n = typeof value === 'string' ? Number(value) : value;
  // A balance owed reads differently from a balance settled, and the colour is
  // doing real work on the khata screen.
  const inferred: Tone = tone ?? (n && n < 0 ? 'danger' : 'default');
  return (
    <Text variant={variant} tone={inferred} style={style}>
      {formatMoney(value, { decimals })}
    </Text>
  );
}

/**
 * A quantity, with its unit.
 *
 * `kind` is not optional on purpose. The server stores grams for RAW and whole
 * packets for PACKED in a column both called qty_base, and a screen that
 * guesses turns 40 kg of turmeric into 40 g. Making the caller state which one
 * they have is the whole point.
 */
export function Qty({
  value,
  kind,
  baseUnit = 'g',
  variant = 'numericSmall',
  tone,
  style,
}: {
  value: number | string | null | undefined;
  kind: ItemKind;
  baseUnit?: BaseUnit;
  variant?: Variant;
  tone?: Tone;
  style?: TextStyle;
}) {
  return (
    <Text variant={variant} tone={tone} style={style}>
      {formatQty(value, kind, baseUnit)}
    </Text>
  );
}

/** Packet count on its own, for a packer's pick list. */
export function Packets({
  value,
  variant = 'numeric',
  tone,
}: {
  value: number | string | null | undefined;
  variant?: Variant;
  tone?: Tone;
}) {
  return (
    <Text variant={variant} tone={tone}>
      {formatPackedQty(value)}
    </Text>
  );
}

/** "500 g" / "1 kg" for a SKU label. Same promotion rule as a stock figure. */
export function PackSize({
  value,
  baseUnit = 'g',
  variant = 'secondary',
  tone = 'muted',
}: {
  value: number | string | null | undefined;
  baseUnit?: BaseUnit;
  variant?: Variant;
  tone?: Tone;
}) {
  return (
    <Text variant={variant} tone={tone}>
      {formatPackSize(value, baseUnit)}
    </Text>
  );
}
