// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * Keep Metro out of native build output.
 *
 * Without this, `expo run:android` crashes Metro outright:
 *
 *   Error: ENOENT: no such file or directory, watch
 *   '...\node_modules\expo-modules-core\android\.cxx\Debug\<hash>\x86\
 *    CMakeFiles\CMakeTmp\CMakeFiles\cmTC_2dd35.dir'
 *
 * CMake creates and deletes `cmTC_*` probe directories while configuring, and
 * `expo run:android` starts Metro alongside the Gradle build. Metro's crawler
 * finds one of those directories, tries to watch it, and by the time the watch
 * call lands CMake has already removed it. The throw is fatal and kills the dev
 * server, so the build appears to fail for a reason unrelated to the app.
 *
 * Metro passes `resolver.blockList` to metro-file-map as its ignore pattern, so
 * a path blocked here is excluded from crawling and watching, not just from
 * module resolution. That is what makes this the right place to fix it.
 *
 * Patterns accept either separator (`[/\\]`) because these run on Windows as
 * well as macOS/Linux, and metro-file-map tests them against native absolute
 * paths.
 *
 * ---------------------------------------------------------------------------
 * A WARNING, learned the hard way: a pattern meant for the PROJECT must be
 * ANCHORED to the project root.
 *
 * The first version of this file blocked any directory named `dist` at any
 * depth, to skip `expo export` output. That also matched
 * `node_modules/whatwg-fetch/dist/`,
 * whose package main IS `./dist/fetch.umd.js`, and the bundle died with
 * "Unable to resolve whatwg-fetch". Shipping from `dist/` is completely normal
 * for an npm package, so an unanchored `dist` rule breaks an unknowable number
 * of dependencies.
 *
 * So: rules about generated output THIS project produces are anchored below.
 * Only rules for things that are build output wherever they appear -- `.cxx`,
 * `.gradle`, Pods -- stay unanchored, deliberately, because they also need to
 * match inside dependencies.
 */

/** Escapes a path for use in a RegExp, with either separator accepted. */
function pathPattern(absolutePath) {
  return absolutePath
    .replace(/[.*+?^${}()|[\]]/g, '\\$&') // regex metacharacters
    .replace(/[\\/]/g, '[\\\\/]'); // accept / or \ at every separator
}

const ROOT = pathPattern(__dirname);

const NATIVE_BUILD_OUTPUT = [
  // --- Unanchored on purpose: build output wherever it occurs, including
  // inside dependencies. `.cxx` is the one that actually crashes Metro, and it
  // lives under node_modules/expo-modules-core/android/.
  /[/\\]\.cxx[/\\].*/,
  // Gradle caches. Also catches a stray cache written into the project by a
  // mangled GRADLE_USER_HOME -- see the Git Bash note in
  // docs/build-and-release.md.
  /[/\\]\.gradle[/\\].*/,
  /[/\\]\.kotlin[/\\].*/,
  /[/\\]ios[/\\]Pods[/\\].*/,

  // --- Anchored to this project: these names are common inside dependencies
  // and must not be matched there.
  new RegExp(`^${ROOT}[\\\\/]android[\\\\/]build[\\\\/].*`),
  new RegExp(`^${ROOT}[\\\\/]android[\\\\/]app[\\\\/]build[\\\\/].*`),
  new RegExp(`^${ROOT}[\\\\/]android[\\\\/]\\.cxx[\\\\/].*`),
  new RegExp(`^${ROOT}[\\\\/]ios[\\\\/]build[\\\\/].*`),
  // `expo export` output. Anchored -- see the warning above.
  new RegExp(`^${ROOT}[\\\\/]dist[\\\\/].*`),
];

const existing = config.resolver.blockList;
config.resolver.blockList = [
  // Preserve whatever Expo's default config already blocked.
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...NATIVE_BUILD_OUTPUT,
];

module.exports = config;
