import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, space, touch } from '../tokens';
import { Text } from './Text';

/** Every screen's outer shell. */
export function Screen({
  children,
  scroll = false,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scrollBody, style]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.body, style]}>{children}</View>
  );
  return <SafeAreaView style={styles.safe} edges={['bottom']}>{body}</SafeAreaView>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * A tappable list row.
 *
 * `title` is 17pt and `subtitle` 15pt, never smaller -- see the type scale note
 * in tokens.ts. The row is at least 56dp so it can be hit reliably while
 * walking, which is how the delivery screens are used.
 */
export function ListRow({
  title,
  subtitle,
  right,
  onPress,
  tall = false,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  /** 88dp, for the packer queue: usable with one thumb and floury hands. */
  tall?: boolean;
}) {
  const content = (
    <View style={[styles.row, tall && { minHeight: 88 }]}>
      <View style={styles.rowMain}>
        {typeof title === 'string' ? <Text variant="bodyStrong">{title}</Text> : title}
        {subtitle
          ? typeof subtitle === 'string'
            ? (
                <Text variant="secondary" tone="muted">
                  {subtitle}
                </Text>
              )
            : subtitle
          : null}
      </View>
      {right ? <View style={styles.rowRight}>{right}</View> : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && { backgroundColor: colors.surface }}
    >
      {content}
    </Pressable>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

type BannerTone = 'info' | 'warning' | 'danger' | 'success';

const BANNER_BG: Record<BannerTone, string> = {
  info: colors.surface,
  warning: '#FFF4E0',
  danger: '#FDECEA',
  success: '#E7F3EE',
};

const BANNER_FG: Record<BannerTone, 'default' | 'warning' | 'danger' | 'success'> = {
  info: 'default',
  warning: 'warning',
  danger: 'danger',
  success: 'success',
};

/**
 * A persistent message. Used for the read-only banner and the offline banner.
 *
 * The read-only one is deliberately always visible rather than a toast on each
 * refused tap: a lapsed subscription is a state, not an event, and the user
 * needs to understand why nothing will save before they try.
 */
export function Banner({
  tone = 'info',
  title,
  detail,
  action,
}: {
  tone?: BannerTone;
  title: string;
  detail?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={[styles.banner, { backgroundColor: BANNER_BG[tone] }]}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" tone={BANNER_FG[tone]}>
          {title}
        </Text>
        {detail ? (
          <Text variant="secondary" tone="muted">
            {detail}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Pressable onPress={action.onPress} style={styles.bannerAction} accessibilityRole="button">
          <Text variant="bodyStrong" tone="primary">
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Order status, colour-coded. Dispatch-onward states read as "in motion". */
export function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'CLOSED'
      ? 'success'
      : status === 'CANCELLED'
        ? 'muted'
        : status === 'OUT_FOR_DELIVERY'
          ? 'warning'
          : 'primary';
  const bg =
    tone === 'success'
      ? '#E7F3EE'
      : tone === 'warning'
        ? '#FFF4E0'
        : tone === 'muted'
          ? colors.surface
          : '#E8F1EE';
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text variant="meta" tone={tone === 'muted' ? 'muted' : tone}>
        {status.replace(/_/g, ' ')}
      </Text>
    </View>
  );
}

/**
 * What an empty list says.
 *
 * Always says what to do next, never just "No data". An owner opening a screen
 * for the first time is the most common way to see one of these.
 */
export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Text variant="heading" tone="muted">
        {title}
      </Text>
      {detail ? (
        <Text variant="secondary" tone="muted" style={{ textAlign: 'center' }}>
          {detail}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.primary} />
      {label ? (
        <Text variant="secondary" tone="muted">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/** A labelled figure, for summary tiles and totals. */
export function Stat({
  label,
  children,
  onPress,
}: {
  label: string;
  children: React.ReactNode;
  onPress?: () => void;
}) {
  const inner = (
    <View style={styles.stat}>
      <Text variant="meta" tone="muted">
        {label}
      </Text>
      {children}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flex: 1 }}>
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, backgroundColor: colors.background },
  scrollBody: { padding: space.lg, gap: space.md, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.sm,
  },
  row: {
    minHeight: touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  rowMain: { flex: 1, gap: 2 },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: space.lg },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  bannerAction: { minHeight: touch.min, justifyContent: 'center', paddingHorizontal: space.sm },
  pill: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
    minHeight: 72,
    justifyContent: 'center',
  },
});
