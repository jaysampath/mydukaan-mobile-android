import { config } from 'dotenv';

// Tests read the same .env.dev the dev build is compiled from, so a drift check
// can never be run against a project the app does not actually use.
config({ path: '.env.dev' });
