import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, elevation, radius, space, touch } from '../tokens';
import { Icon, type IconName } from './Icon';
import { Text, type Tone } from './Text';

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

/**
 * A white surface lifted off the tinted page. Grouping is carried by the card
 * edge rather than by borders, which is most of what makes the app read as
 * current rather than as a form.
 */
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * A titled group: a heading on the page, then its rows in one card.
 * The heading can carry an icon and a trailing action ("See all").
 */
export function Section({
  title,
  icon,
  action,
  children,
  flush = true,
}: {
  title?: string;
  icon?: IconName;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
  /** Rows run edge to edge inside the card. False gives the card its padding. */
  flush?: boolean;
}) {
  return (
    <View style={{ gap: space.sm }}>
      {title ? (
        <View style={styles.sectionHead}>
          {icon ? <Icon name={icon} size="sm" tone="muted" /> : null}
          <Text variant="secondary" tone="muted" style={{ flex: 1, fontWeight: '600' }}>
            {title}
          </Text>
          {action ? (
            <Pressable
              onPress={action.onPress}
              accessibilityRole="button"
              hitSlop={12}
              style={styles.sectionAction}
            >
              <Text variant="secondary" tone="primary" style={{ fontWeight: '600' }}>
                {action.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Card style={flush ? styles.flushCard : undefined}>{children}</Card>
    </View>
  );
}

/**
 * A tappable list row.
 *
 * `title` is 17pt and `subtitle` 15pt, never smaller -- see the type scale note
 * in tokens.ts. The row is at least 56dp so it can be hit reliably while
 * walking, which is how the delivery screens are used.
 *
 * `leading` takes an Avatar or an IconBadge. A tappable row with nothing on
 * the right gets a chevron, so it is obvious it goes somewhere. `card` renders
 * the row as its own card, for lists of cards on the page.
 */
export function ListRow({
  title,
  subtitle,
  right,
  onPress,
  leading,
  card = false,
  tall = false,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  /** An <Avatar> or an <IconBadge>. */
  leading?: React.ReactNode;
  card?: boolean;
  /** 88dp, for the packer queue: usable with one thumb and floury hands. */
  tall?: boolean;
}) {
  const content = (
    <View style={[styles.row, tall && { minHeight: 88 }]}>
      {leading ?? null}
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
      {onPress && !right ? <Icon name="chevron-forward" size="sm" tone="muted" /> : null}
    </View>
  );

  const shell = card ? styles.rowCard : undefined;
  if (!onPress) return <View style={shell}>{content}</View>;
  return (
    <View style={shell}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        android_ripple={{ color: colors.border }}
      >
        {content}
      </Pressable>
    </View>
  );
}

/** An icon in a tinted circle, sized to sit in a ListRow's `leading` slot. */
export function IconBadge({
  name,
  tone = 'primary',
  size = 40,
}: {
  name: IconName;
  tone?: Tone;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: TINT[tone] ?? colors.surface,
        },
      ]}
    >
      <Icon name={name} size={size >= 40 ? 'md' : 'sm'} tone={tone} />
    </View>
  );
}

export function Divider({ inset = false }: { inset?: boolean }) {
  // `inset` lines up with the text of a row that has a 40dp leading avatar.
  return <View style={[styles.divider, inset && { marginLeft: space.lg + 40 + space.md }]} />;
}

/** Vertical space between cards in a list of cards. */
export function Gap() {
  return <View style={{ height: space.sm }} />;
}

/** Every tint below is from the measured table in tokens.ts. */
const TINT: Partial<Record<Tone, string>> = {
  primary: colors.primarySoft,
  success: colors.successSoft,
  warning: colors.warningSoft,
  danger: colors.dangerSoft,
  info: colors.infoSoft,
  muted: colors.surface,
};

type BannerTone = 'info' | 'warning' | 'danger' | 'success';

const BANNER_ICON: Record<BannerTone, IconName> = {
  info: 'information-circle',
  warning: 'cloud-offline',
  danger: 'lock-closed',
  success: 'checkmark-circle',
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
  icon,
}: {
  tone?: BannerTone;
  title: string;
  detail?: string;
  action?: { label: string; onPress: () => void };
  icon?: IconName;
}) {
  return (
    <View style={[styles.banner, { backgroundColor: TINT[tone] }]}>
      <Icon name={icon ?? BANNER_ICON[tone]} tone={tone} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" tone={tone}>
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

/** Order status: a tint, an icon and the word, so it reads at a glance. */
const STATUS_STYLE: Record<string, { tone: Tone; icon: IconName }> = {
  PLACED: { tone: 'info', icon: 'time-outline' },
  PACKED: { tone: 'primary', icon: 'cube-outline' },
  OUT_FOR_DELIVERY: { tone: 'warning', icon: 'bicycle-outline' },
  DELIVERED: { tone: 'primary', icon: 'home-outline' },
  PAYMENT_PENDING: { tone: 'warning', icon: 'wallet-outline' },
  CLOSED: { tone: 'success', icon: 'checkmark-circle-outline' },
  CANCELLED: { tone: 'muted', icon: 'close-circle-outline' },
};

export function StatusPill({ status }: { status: string }) {
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.PLACED;
  return (
    <View style={[styles.pill, { backgroundColor: TINT[st.tone] }]}>
      <Icon name={st.icon} size="sm" tone={st.tone} />
      <Text variant="meta" tone={st.tone} style={{ fontWeight: '600' }}>
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
  icon = 'file-tray-outline',
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
  icon?: IconName;
}) {
  return (
    <View style={styles.empty}>
      <IconBadge name={icon} size={64} />
      <Text variant="heading" style={{ textAlign: 'center' }}>
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

/**
 * A labelled figure, for summary tiles and totals. With an icon it renders as
 * a dashboard tile: tinted icon badge, figure, label.
 */
export function Stat({
  label,
  children,
  onPress,
  icon,
  tone = 'primary',
}: {
  label: string;
  children: React.ReactNode;
  onPress?: () => void;
  icon?: IconName;
  tone?: Tone;
}) {
  const inner = (
    <View style={styles.stat}>
      {icon ? <IconBadge name={icon} tone={tone} size={36} /> : null}
      {children}
      <Text variant="secondary" tone="muted">
        {label}
      </Text>
    </View>
  );
  if (!onPress) return <View style={{ flex: 1 }}>{inner}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.85 }]}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  body: { flex: 1, backgroundColor: colors.page },
  scrollBody: { padding: space.lg, gap: space.md, backgroundColor: colors.page },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
    ...elevation.card,
  },
  flushCard: { padding: 0, gap: 0, overflow: 'hidden' },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.xs,
    minHeight: 24,
  },
  sectionAction: { minHeight: 24, justifyContent: 'center' },
  row: {
    minHeight: touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  rowCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...elevation.card,
  },
  rowMain: { flex: 1, gap: 2 },
  rowRight: { alignItems: 'flex-end', gap: space.xs },
  badge: { alignItems: 'center', justifyContent: 'center' },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
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
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.xs,
    minHeight: 72,
    justifyContent: 'center',
    ...elevation.card,
  },
});
