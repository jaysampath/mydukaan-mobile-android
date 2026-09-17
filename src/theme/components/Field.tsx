import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, space, touch, type as typeScale } from '../tokens';
import { Text } from './Text';

/**
 * A labelled input.
 *
 * The label is always visible, never a placeholder that vanishes when you type.
 * A placeholder-only form is unusable for someone who is not confident with
 * phones: once they start typing they have lost the only clue about what the
 * box is for.
 */
export function Field({
  label,
  hint,
  error,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View style={styles.field}>
      <Text variant="secondary" tone="muted">
        {label}
      </Text>
      <TextInput
        {...input}
        placeholderTextColor={colors.muted}
        style={[styles.input, !!error && { borderColor: colors.danger }, input.style]}
      />
      {error ? (
        <Text variant="meta" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="meta" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** A number field. Always numeric-pad -- these users are entering quantities. */
export function NumberField(props: TextInputProps & { label: string; hint?: string; error?: string }) {
  return <Field keyboardType="numeric" {...props} />;
}

/**
 * Plus/minus stepper for small counts.
 *
 * Tapping beats typing for "how many packets" on a phone with a cracked screen
 * in a shop, but the value stays editable for the case where it is 40.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  const clamp = (n: number) => Math.min(Math.max(n, min), max);
  return (
    <View style={styles.field}>
      {label ? (
        <Text variant="secondary" tone="muted">
          {label}
        </Text>
      ) : null}
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Decrease"
          onPress={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          style={({ pressed }) => [
            styles.stepBtn,
            { opacity: value <= min ? 0.35 : pressed ? 0.7 : 1 },
          ]}
        >
          <Text variant="title">-</Text>
        </Pressable>
        <TextInput
          value={String(value)}
          onChangeText={(t) => onChange(clamp(Number(t.replace(/[^0-9]/g, '')) || 0))}
          keyboardType="numeric"
          style={styles.stepValue}
          selectTextOnFocus
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Increase"
          onPress={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          style={({ pressed }) => [
            styles.stepBtn,
            { opacity: value >= max ? 0.35 : pressed ? 0.7 : 1 },
          ]}
        >
          <Text variant="title">+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.searchWrap}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        style={styles.input}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

/** A one-of-N choice. Used for roles, entry types, status filters. */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.field}>
      {label ? (
        <Text variant="secondary" tone="muted">
          {label}
        </Text>
      ) : null}
      <View style={styles.choiceRow}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.value)}
              style={[
                styles.choice,
                on && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Text variant="bodyStrong" style={{ color: on ? colors.onPrimary : colors.text }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  input: {
    minHeight: touch.min,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
    backgroundColor: colors.background,
  },
  searchWrap: { paddingHorizontal: space.lg, paddingVertical: space.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepBtn: {
    width: touch.min,
    height: touch.min,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  stepValue: {
    flex: 1,
    minHeight: touch.min,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    fontSize: typeScale.numeric.fontSize,
    fontWeight: '700',
    color: colors.text,
  },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: {
    minHeight: touch.min,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
});
