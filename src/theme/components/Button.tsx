import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { CONFIRM_ARM_MS, colors, radius, space, touch } from '../tokens';
import { Text } from './Text';

type Kind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dispatch';

const BG: Record<Kind, string> = {
  primary: colors.primary,
  secondary: colors.surface,
  ghost: 'transparent',
  danger: colors.danger,
  dispatch: colors.dispatch,
};

const FG: Record<Kind, string> = {
  primary: colors.onPrimary,
  secondary: colors.text,
  ghost: colors.primary,
  danger: colors.onPrimary,
  dispatch: colors.onPrimary,
};

export interface ButtonProps {
  label: string;
  onPress: () => void;
  kind?: Kind;
  /** Full width and taller. The default for a screen's main action. */
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  block = true,
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: BG[kind],
          borderColor: kind === 'secondary' ? colors.border : 'transparent',
          borderWidth: kind === 'secondary' ? 1 : 0,
          alignSelf: block ? 'stretch' : 'flex-start',
          paddingHorizontal: block ? space.lg : space.xl,
          opacity: off ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={FG[kind]} />
      ) : (
        <Text variant="bodyStrong" style={{ color: FG[kind] }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * A confirm for something that cannot be undone.
 *
 * Two deliberate choices:
 *
 * 1. The button is DISABLED for the first CONFIRM_ARM_MS after it renders, so a
 *    tap carried over from the previous screen cannot fire it. Dispatch is
 *    reached by tapping a button on the order screen, and on a slow phone the
 *    new screen can arrive under a finger that is already moving.
 *
 * 2. No hold-to-confirm and no "type DISPATCH to continue". This audience reads
 *    an unresponsive button as a broken app, and a typing challenge as the app
 *    refusing to work. A short arming delay plus a full screen of context is
 *    the most friction that is still honest here.
 */
export function ArmedButton({
  label,
  armingLabel,
  onPress,
  kind = 'dispatch',
  loading = false,
  disabled = false,
}: {
  label: string;
  /** Shown while the button is still arming, e.g. "Check the list above". */
  armingLabel?: string;
  onPress: () => void;
  kind?: Kind;
  loading?: boolean;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), CONFIRM_ARM_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <Button
      label={!armed && armingLabel ? armingLabel : label}
      onPress={onPress}
      kind={kind}
      loading={loading}
      disabled={disabled || !armed}
      style={{ minHeight: touch.irreversible }}
    />
  );
}

/** Keeps a screen's main action clear of everything else that is tappable. */
export function ActionBar({ children }: { children: React.ReactNode }) {
  return <View style={styles.bar}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    gap: space.md,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    paddingHorizontal: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
