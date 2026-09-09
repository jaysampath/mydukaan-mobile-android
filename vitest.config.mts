import { defineConfig } from 'vitest/config';

/**
 * Unit tests run in Node, not on a device.
 *
 * That limits what is testable: anything touching WatermelonDB's native SQLite
 * adapter, expo-constants or NetInfo cannot run here. What CAN run is the part
 * that matters most -- the pure logic, and the schema drift check that keeps
 * this repo honest against mydukaan-backend.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The drift check talks to the dev Supabase project over HTTP.
    testTimeout: 20_000,
    setupFiles: ['./vitest.setup.mts'],
  },
});
