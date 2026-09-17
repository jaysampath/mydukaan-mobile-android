#!/usr/bin/env node
/**
 * Run the app on a connected Android device (or emulator).
 *
 * MOST OF THE TIME YOU DO NOT NEED THIS SCRIPT. Since WatermelonDB was removed
 * (docs/adr/0003-remove-offline-sync.md) every native module the app uses is
 * already inside Expo Go, so the fast loop is:
 *
 *   npm start        then open the project in Expo Go
 *
 * This script is the dev-client path, for when Expo Go will not do: a release
 * build, a native config change, an Expo Go that does not support this SDK, or
 * once react-native-purchases lands for billing and Expo Go stops being an
 * option at all.
 *
 * IMPORTANT: the native module set changed when sync was removed --
 * WatermelonDB went, and react-native-screens, react-native-gesture-handler,
 * expo-localization, expo-print, expo-sharing and expo-file-system arrived. A
 * dev client built before that change is missing all of them and will crash at
 * runtime rather than fail to build. If you have an old one installed, use
 * --build to force a rebuild; this script only detects ABSENCE, not staleness.
 *
 * The loop is two-stage, and the stages have very different costs:
 *
 *   1. Native build + install  -- minutes. Only needed the first time, and
 *      after any change to native config (bundle id, plugins, native deps).
 *   2. Metro                   -- seconds. Everything else.
 *
 * This script picks the right stage for you: it installs the dev client only
 * if the device does not already have it, then starts Metro.
 *
 *   node scripts/run-android.mjs            # install if missing, then Metro
 *   node scripts/run-android.mjs --build    # force the native rebuild
 *   node scripts/run-android.mjs --clear    # Metro with a cleared cache
 *
 * The package id is derived from branding.json the same way app.config.ts
 * derives it, so this script keeps working when the bundle id changes.
 *
 * APP_ENV selects the Supabase project and the .dev suffix; defaults to dev.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = new Set(process.argv.slice(2));
const FORCE_BUILD = args.has('--build');
const CLEAR_CACHE = args.has('--clear');

const APP_ENV = process.env.APP_ENV ?? 'dev';
if (APP_ENV !== 'dev' && APP_ENV !== 'prod') {
  fail(`APP_ENV must be "dev" or "prod", got "${APP_ENV}"`);
}

// Same derivation as app.config.ts: branding.json is the single source of
// truth, and dev gets a .dev suffix so both variants can sit on one phone.
const branding = JSON.parse(readFileSync(new URL('../branding.json', import.meta.url), 'utf8'));
const PACKAGE_ID = APP_ENV === 'dev' ? `${branding.bundleId}.dev` : branding.bundleId;
const METRO_PORT = Number(process.env.RCT_METRO_PORT ?? 8081);

function log(msg) {
  console.log(`\x1b[36m>\x1b[0m ${msg}`);
}
function warn(msg) {
  console.warn(`\x1b[33m!\x1b[0m ${msg}`);
}
function fail(msg, hint) {
  console.error(`\x1b[31mx\x1b[0m ${msg}`);
  if (hint) console.error(`\n${hint}\n`);
  process.exit(1);
}

/** ---------------------------------------------------------------- adb ---- */

function findAdb() {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!sdk) {
    fail(
      'ANDROID_HOME is not set, so the Android SDK cannot be located.',
      'Set it to your SDK directory, e.g.\n' +
        '  setx ANDROID_HOME "D:\\AppData\\AndroidStudio\\Local\\Android\\sdk"\n' +
        'then open a new terminal.',
    );
  }
  const adb = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  if (!existsSync(adb)) {
    fail(`No adb at ${adb}`, 'Install "Android SDK Platform-Tools" via Android Studio.');
  }
  return adb;
}

const ADB = findAdb();

function adb(adbArgs, opts = {}) {
  return spawnSync(ADB, adbArgs, { encoding: 'utf8', ...opts });
}

/**
 * Pick a device to run on.
 *
 * A physical device wins over an emulator: if you have a phone plugged in you
 * almost certainly meant to use it. ANDROID_SERIAL overrides, matching adb's
 * own convention.
 */
function selectDevice() {
  const out = adb(['devices']).stdout ?? '';
  // Match only real rows. adb prints "List of devices attached" and, on a cold
  // start, "* daemon not running; starting now" -- neither is a device.
  const rows = out
    .split('\n')
    .map((line) => line.trim())
    .map((line) => /^(\S+)\s+(device|unauthorized|offline)$/.exec(line))
    .filter(Boolean)
    .map((m) => ({ serial: m[1], state: m[2] }));

  const unauthorized = rows.filter((r) => r.state === 'unauthorized');
  const ready = rows.filter((r) => r.state === 'device');

  if (ready.length === 0) {
    let hint =
      'Plug in the phone over USB, then on the phone:\n' +
      '  Settings > About phone > tap "Build number" 7 times\n' +
      '  Settings > Developer options > enable "USB debugging"\n' +
      'Then accept the "Allow USB debugging?" prompt when it appears.';
    if (unauthorized.length > 0) {
      hint =
        `The device ${unauthorized[0].serial} is connected but UNAUTHORIZED.\n` +
        'Unlock the phone and accept the "Allow USB debugging?" prompt.\n' +
        'If no prompt appears, revoke and retry:\n' +
        '  Settings > Developer options > Revoke USB debugging authorisations';
    }
    fail('No usable Android device found.', hint);
  }

  if (process.env.ANDROID_SERIAL) {
    const match = ready.find((r) => r.serial === process.env.ANDROID_SERIAL);
    if (!match) {
      fail(
        `ANDROID_SERIAL=${process.env.ANDROID_SERIAL} is not among the ready devices: ` +
          ready.map((r) => r.serial).join(', '),
      );
    }
    return match.serial;
  }

  const physical = ready.filter((r) => !r.serial.startsWith('emulator-'));
  const chosen = (physical.length > 0 ? physical : ready)[0];

  if ((physical.length > 0 ? physical : ready).length > 1) {
    warn(
      `Several devices are connected (${ready.map((r) => r.serial).join(', ')}); using ${chosen.serial}.`,
    );
    warn('Set ANDROID_SERIAL=<serial> to choose a different one.');
  }
  return chosen.serial;
}

function deviceLabel(serial) {
  const model = adb(['-s', serial, 'shell', 'getprop', 'ro.product.model']).stdout?.trim();
  const release = adb(['-s', serial, 'shell', 'getprop', 'ro.build.version.release']).stdout?.trim();
  const kind = serial.startsWith('emulator-') ? 'emulator' : 'device';
  return `${model || 'unknown'} (Android ${release || '?'}, ${kind}, ${serial})`;
}

/** ------------------------------------------------------------ preflight -- */

/**
 * A relative GRADLE_USER_HOME is resolved against Gradle's working directory,
 * which for a prebuild project is ./android. That silently builds a throwaway
 * cache inside the project -- and `expo prebuild --clean` then deletes it, so
 * every build re-downloads the world. Catch it before it costs half an hour.
 */
function checkGradleHome() {
  const value = process.env.GRADLE_USER_HOME;
  if (!value) return undefined;

  const isAbsolute = /^([A-Za-z]:[\\/]|[\\/]|~)/.test(value);
  if (isAbsolute) return value;

  warn(`GRADLE_USER_HOME is "${value}", which is a RELATIVE path.`);
  warn('Gradle would resolve it inside ./android and re-download every dependency.');
  warn('Ignoring it for this run. To fix it permanently (note the drive colon):');
  warn('  [Environment]::SetEnvironmentVariable("GRADLE_USER_HOME","D:\\Dev\\.gradle","User")');
  return null; // signal: unset for child processes
}

function checkJava() {
  const res = spawnSync('java', ['-version'], { encoding: 'utf8', shell: true });
  const text = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  const version = text.match(/version "(\d+)/);
  if (!version) {
    warn('Could not determine the Java version. A JDK 17 is expected for this Expo/AGP setup.');
    return;
  }
  if (version[1] !== '17') {
    warn(`Java ${version[1]} detected; this project expects JDK 17. Gradle may fail.`);
  }
}

function isInstalled(serial) {
  // `pm list packages <filter>` matches substrings, so the prod id would also
  // match the .dev package. Compare the parsed names exactly.
  const res = adb(['-s', serial, 'shell', 'pm', 'list', 'packages', PACKAGE_ID]);
  return (res.stdout ?? '')
    .split('\n')
    .map((line) => line.trim().replace(/^package:/, ''))
    .includes(PACKAGE_ID);
}

/** ----------------------------------------------------------------- run --- */

function childEnv(gradleHome) {
  const env = { ...process.env, APP_ENV };
  if (gradleHome === null) delete env.GRADLE_USER_HOME;
  return env;
}

function runExpo(expoArgs, env) {
  // shell:true so npx resolves via npx.cmd on Windows.
  const res = spawnSync('npx', ['expo', ...expoArgs], {
    stdio: 'inherit',
    shell: true,
    env,
  });
  return res.status ?? 1;
}

function main() {
  log(`APP_ENV=${APP_ENV}  package=${PACKAGE_ID}`);

  const gradleHome = checkGradleHome();
  const serial = selectDevice();
  log(`Using ${deviceLabel(serial)}`);

  const env = childEnv(gradleHome);
  env.ANDROID_SERIAL = serial;

  const installed = isInstalled(serial);
  const needsBuild = FORCE_BUILD || !installed;

  if (needsBuild) {
    checkJava();
    log(
      FORCE_BUILD
        ? 'Forcing a native rebuild (--build).'
        : `${PACKAGE_ID} is not installed on this device; building the dev client.`,
    );
    log('First build takes several minutes. Later runs skip straight to Metro.');

    // expo run:android builds, installs, launches, and starts Metro itself.
    //
    // Deliberately no --device flag: it wants Expo's own device *name*, which
    // for a running emulator is the AVD name rather than the adb serial, so
    // passing a serial fails with "Could not find device with name: ...".
    // ANDROID_SERIAL (set above) is what the underlying adb calls honour.
    const code = runExpo(['run:android'], env);
    process.exit(code);
  }

  log(`${PACKAGE_ID} is already installed; skipping the native build.`);
  log('Pass --build if you changed native config (bundle id, plugins, native deps).');

  // Over USB the phone has no route to the host's "localhost". adb reverse
  // opens one, which is how the dev client reaches Metro on a real device.
  // (An emulator can also use 10.0.2.2, but reverse works for both.)
  const rev = adb(['-s', serial, 'reverse', `tcp:${METRO_PORT}`, `tcp:${METRO_PORT}`]);
  if (rev.status !== 0) {
    warn(`adb reverse failed: ${(rev.stderr ?? '').trim()}`);
    warn('The dev client may not find Metro. Reconnect the cable and retry.');
  } else {
    log(`adb reverse tcp:${METRO_PORT} -> host tcp:${METRO_PORT}`);
  }

  adb(['-s', serial, 'shell', 'monkey', '-p', PACKAGE_ID, '-c', 'android.intent.category.LAUNCHER', '1'], {
    stdio: 'ignore',
  });
  log('Launched the app. It will connect once Metro is up.');
  log('If it shows the launcher screen, tap the server with the green dot.');

  const metroArgs = ['start', '--dev-client'];
  if (CLEAR_CACHE) metroArgs.push('--clear');
  // Keep Metro on the port we just reversed, or the two silently disagree.
  if (METRO_PORT !== 8081) metroArgs.push('--port', String(METRO_PORT));

  const metro = spawn('npx', ['expo', ...metroArgs], { stdio: 'inherit', shell: true, env });
  metro.on('exit', (code) => process.exit(code ?? 0));
}

main();
