import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { branding } from './branding.config';
import { Phase0Screen } from './src/features/phase0/Phase0Screen';

/**
 * Phase 0 only. Navigation, roles, and the feature screens land in Phase 1
 * once the offline-sync proof is signed off.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: branding.colors.background }}>
        <StatusBar style="dark" />
        <Phase0Screen />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
