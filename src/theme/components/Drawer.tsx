import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../auth/context';
import { useSession } from '../../auth/session';
import { isDev } from '../../env';
import { t } from '../../i18n';
import { drawerSections, SECTION_LABEL_KEYS } from '../../nav/drawerItems';
import { colors, elevation, radius, space, touch } from '../tokens';
import { Avatar } from './Avatar';
import { Icon, type IconName } from './Icon';
import { Text, type Tone } from './Text';

/**
 * The side drawer: who you are, the occasional destinations, and sign-out.
 *
 * Built on core Modal + Animated rather than @react-navigation/drawer, which
 * needs react-native-reanimated and react-native-worklets -- two more native
 * modules and a dev-client rebuild on every bump, to slide one panel.
 *
 * Mounted once per shell (owner, packer, delivery) so every role finds their
 * profile and sign-out in the same place. The hamburger in <Header> opens it;
 * the scrim, the Android back button and choosing an item close it.
 */

interface DrawerApi {
  open: () => void;
  close: () => void;
}

const DrawerCtx = createContext<DrawerApi | null>(null);

/** Null outside a shell, which is how <Header> knows not to draw a hamburger. */
export function useDrawer(): DrawerApi | null {
  return useContext(DrawerCtx);
}

const OPEN_MS = 220;
const CLOSE_MS = 180;

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: OPEN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const close = useCallback(() => {
    Animated.timing(progress, {
      toValue: 0,
      duration: CLOSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setVisible(false));
  }, [progress]);

  const api = useMemo<DrawerApi>(() => ({ open: () => setVisible(true), close }), [close]);

  return (
    <DrawerCtx.Provider value={api}>
      {children}
      <DrawerPanel visible={visible} progress={progress} onClose={close} />
    </DrawerCtx.Provider>
  );
}

function DrawerPanel({
  visible,
  progress,
  onClose,
}: {
  visible: boolean;
  progress: Animated.Value;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panelWidth = Math.min(320, Math.round(width * 0.85));
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-panelWidth, 0] });

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
          <Pressable
            style={{ flex: 1 }}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('drawer.close')}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[styles.panel, { width: panelWidth, transform: [{ translateX }] }]}
        >
          <DrawerContent onClose={onClose} insetTop={insets.top} insetBottom={insets.bottom} />
        </Animated.View>
      </View>
    </Modal>
  );
}

function DrawerContent({
  onClose,
  insetTop,
  insetBottom,
}: {
  onClose: () => void;
  insetTop: number;
  insetBottom: number;
}) {
  const router = useRouter();
  const me = useMe();
  const { signOut } = useSession();

  const name = me.context?.profile?.full_name ?? '';
  const sections = drawerSections({ role: me.role, hasPacking: me.hasPacking });

  const go = (href: string) => {
    onClose();
    router.push(href as Href);
  };

  return (
    <>
      <Pressable
        onPress={() => go('/profile')}
        accessibilityRole="button"
        accessibilityHint={t('drawer.editProfile')}
        android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
        style={[styles.profile, { paddingTop: insetTop + space.xl }]}
      >
        <Avatar name={name || me.business?.name} size={56} />
        <View style={{ gap: 2 }}>
          <Text variant="heading" tone="onPrimary">
            {name || t('drawer.noName')}
          </Text>
          <Text variant="secondary" style={{ color: colors.primarySoft }}>
            {[me.role ? t(`roles.${me.role}`) : null, me.business?.name]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <View style={styles.profileFoot}>
          <PlanPill />
          <View style={styles.editLink}>
            <Text variant="secondary" style={{ color: colors.primarySoft, fontWeight: '600' }}>
              {t('drawer.editProfile')}
            </Text>
            <Icon name="chevron-forward" size="sm" color={colors.primarySoft} />
          </View>
        </View>
      </Pressable>

      <ScrollView contentContainerStyle={{ paddingVertical: space.sm }}>
        {sections.map(({ section, items }) => (
          <View key={section} style={styles.section}>
            <Text variant="meta" tone="muted" style={styles.sectionLabel}>
              {t(SECTION_LABEL_KEYS[section]).toUpperCase()}
            </Text>
            {items.map((item) => (
              <DrawerRow
                key={item.key}
                icon={item.icon as IconName}
                label={t(item.labelKey)}
                detail={
                  item.key === 'staff' && me.seats
                    ? t('staff.seats', { used: me.seats.used, limit: me.seats.limit })
                    : undefined
                }
                onPress={() => go(item.href)}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insetBottom + space.sm }]}>
        <DrawerRow
          icon="log-out-outline"
          label={t('common.signOut')}
          tone="danger"
          onPress={() => {
            onClose();
            void signOut();
          }}
        />
        <Text variant="meta" tone="muted" style={{ paddingHorizontal: space.lg }}>
          {t('drawer.version', { version: Constants.expoConfig?.version ?? '?' })}
          {isDev ? ` · dev · ${me.business?.subscription_status ?? ''}` : ''}
        </Text>
      </View>
    </>
  );
}

function DrawerRow({
  icon,
  label,
  detail,
  tone = 'default',
  onPress,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  tone?: Tone;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      android_ripple={{ color: colors.border }}
      style={styles.row}
    >
      <Icon name={icon} tone={tone === 'default' ? 'muted' : tone} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" tone={tone}>
          {label}
        </Text>
        {detail ? (
          <Text variant="meta" tone="muted">
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * The plan, as the server reports it. Read-only comes from is_read_only and is
 * never re-derived; the trial countdown only formats a date the server sent.
 */
function PlanPill() {
  const me = useMe();
  const b = me.business;
  if (!b) return null;

  let tone: Tone = 'success';
  let label = t('subscription.active');
  if (me.isReadOnly) {
    tone = 'danger';
    label = t('subscription.readOnly');
  } else if (b.subscription_status === 'TRIAL') {
    tone = 'info';
    const days = b.trial_ends_at
      ? Math.max(0, Math.ceil((Date.parse(b.trial_ends_at) - Date.now()) / 86_400_000))
      : null;
    label =
      days == null ? t('subscription.trial') : t('subscription.trialDaysLeft', { count: days });
  }

  return (
    <View style={styles.planPill}>
      <Text variant="meta" tone={tone} style={{ fontWeight: '700' }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: colors.scrim },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.background,
    borderTopRightRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    overflow: 'hidden',
    ...elevation.raised,
  },
  profile: {
    backgroundColor: colors.primary,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.md,
  },
  profileFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 24 },
  // White pill on the primary header: every tone used here is measured on
  // white in tokens.ts (primary 6.07, info 7+, danger 6.54).
  planPill: {
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  section: { paddingTop: space.sm },
  sectionLabel: {
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  row: {
    minHeight: touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: space.lg,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.xs,
    gap: space.xs,
  },
});
