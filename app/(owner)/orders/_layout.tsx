import { Stack } from 'expo-router';

import { colors } from '../../../src/theme/tokens';

export default function SectionLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.page } }}
    />
  );
}
