import { defineConfig } from 'vitest/config';

/**
 * Unit tests run in Node, not on a device.
 *
 * That limits what is testable: anything importing the React Native module
 * graph -- expo-constants, NetInfo, the router -- cannot load here. What CAN
 * run is the pure logic (formatting, role decisions, landing routes, query
 * keys, error mapping) plus the HTTP contract check that keeps this repo honest
 * against mydukaan-backend.
 *
 * `npm test` excludes *.contract.test.ts so a typecheck-and-test loop needs no
 * network; `npm run test:contract` runs those against the dev project.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The contract check talks to the dev Supabase project over HTTP.
    testTimeout: 20_000,
    setupFiles: ['./vitest.setup.mts'],
  },
});
