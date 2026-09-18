import { StyleSheet, View } from 'react-native';

import { avatarPalette } from '../tokens';
import { Text } from './Text';

/** First letters of the first two words: "Ravi Kirana Store" -> "RK". */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...words[0]][0] ?? '';
  const second = words.length > 1 ? ([...words[1]][0] ?? '') : '';
  return (first + second).toUpperCase();
}

/** Stable per name, so a customer is the same colour on every screen. */
function paletteFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) | 0;
  return avatarPalette[Math.abs(h) % avatarPalette.length];
}

export function Avatar({ name, size = 40 }: { name: string | null | undefined; size?: number }) {
  const p = paletteFor(name ?? '');
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: p.bg },
      ]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        variant={size >= 56 ? 'title' : 'bodyStrong'}
        style={{ color: p.fg }}
        allowFontScaling={false}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
});
