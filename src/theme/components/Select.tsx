import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space, touch } from '../tokens';
import { t } from '../../i18n';
import { SearchBar } from './Field';
import { Icon } from './Icon';
import { Text } from './Text';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** A second line in the picker, e.g. current stock or pack size. */
  detail?: string;
}

/** Past this many options the picker gets a search box. */
const SEARCH_THRESHOLD = 8;

/**
 * A dropdown: one closed field, a bottom-sheet list when tapped.
 *
 * For choosing one record out of a list that grows with the business -- bulk
 * products, packet sizes, suppliers. `Choice` (a row of buttons) stays for
 * small fixed sets like modes; a wall of forty product buttons is what this
 * replaces.
 *
 * Built on core Modal like the drawer, so no native dependency. The label is
 * always visible above the field, for the same reason as in `Field`.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  hint,
  disabled = false,
}: {
  label: string;
  value: T | '' | null | undefined;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const selected = options.find((o) => o.value === value);
  const empty = options.length === 0;
  const off = disabled || empty;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, search]);

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  return (
    <View style={styles.field}>
      <Text variant="secondary" tone="muted">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder ?? t('common.choose')}`}
        accessibilityState={{ disabled: off, expanded: open }}
        onPress={off ? undefined : () => setOpen(true)}
        android_ripple={off ? undefined : { color: colors.border }}
        style={[styles.trigger, off && { opacity: 0.55 }]}
      >
        <Text
          variant="body"
          tone={selected ? 'default' : 'muted'}
          numberOfLines={1}
          style={{ flex: 1 }}
        >
          {selected?.label ??
            (empty ? t('common.noOptions') : (placeholder ?? t('common.choose')))}
        </Text>
        <Icon name="chevron-down" size="sm" tone="muted" />
      </Pressable>
      {hint ? (
        <Text variant="meta" tone="muted">
          {hint}
        </Text>
      ) : null}

      <Modal
        transparent
        visible={open}
        animationType="slide"
        onRequestClose={close}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          />
          <View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              { maxHeight: Math.round(height * 0.7), paddingBottom: insets.bottom + space.sm },
            ]}
          >
            <View style={styles.sheetHead}>
              <Text variant="heading" style={{ flex: 1 }}>
                {label}
              </Text>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
                style={styles.closeBtn}
              >
                <Icon name="close" tone="muted" />
              </Pressable>
            </View>
            {options.length > SEARCH_THRESHOLD ? (
              <SearchBar value={search} onChangeText={setSearch} placeholder={t('common.search')} />
            ) : null}
            <FlatList
              data={shown}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const on = item.value === value;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      onChange(item.value);
                      close();
                    }}
                    android_ripple={{ color: colors.border }}
                    style={[styles.option, on && { backgroundColor: colors.primarySoft }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text variant={on ? 'bodyStrong' : 'body'}>{item.label}</Text>
                      {item.detail ? (
                        <Text variant="secondary" tone="muted">
                          {item.detail}
                        </Text>
                      ) : null}
                    </View>
                    {on ? <Icon name="checkmark" tone="primary" /> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  trigger: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingTop: space.sm,
    minHeight: touch.row,
  },
  closeBtn: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: {
    minHeight: touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
});
