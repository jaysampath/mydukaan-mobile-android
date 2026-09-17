# Build and release

**Local builds only. There are no EAS secrets and no EAS cloud builds in this
project, by design.** Android is built with local Gradle and published to the
Play Store. iOS is built and pushed from a GitHub Actions workflow.

---

## Toolchain

Pinned deliberately. If you change any of these, say why in the commit.

| | Version | Why this one |
|---|---|---|
| Node | 20.19+ (tested on 22.22) | Expo SDK 54's supported range. `engines` in package.json enforces it. |
| JDK | 17 (Temurin) | Required by React Native 0.81's Gradle plugin. |
| Expo SDK | 54 | See below — this is the load-bearing choice. |
| React Native | 0.81.5 | Ships with SDK 54. |
| React | 19.1.0 | Ships with SDK 54. |
| WatermelonDB | 0.28.0 | Latest. Released Apr 2025. |
| `@morrowdigital/watermelondb-expo-plugin` | 2.4.0-beta.0 | The 2.3.3 stable is from May 2024 and predates the New Architecture. The beta is the version that works. |
| `@supabase/supabase-js` | 2.112.3 | Latest 2.x. **Not** 3.x — that line is still `next`. |
| Android build-tools | 35–37 present | Gradle picks what RN 0.81 asks for. |

### Why Expo SDK 54 and not 57

SDK 57 is current. We are on 54 on purpose.

WatermelonDB 0.28.0 was released in April 2025, and the Expo config plugin that
wires its JSI bridge into the native projects had its last *stable* release in
May 2024. SDK 57 / RN 0.86 is considerably newer than both. The entire value of
this app rests on the local database working correctly on cheap Android
hardware — that is not a component to run unproven.

SDK 54 (RN 0.81) is close in time to WatermelonDB 0.28.0, is still actively
patched by Expo, and — verified in this repo — the plugin wires the JSI package
into `MainApplication.kt`, `settings.gradle`, and `app/build.gradle` correctly
on it.

Revisit after Phase 0 ships and the sync path has real-device mileage.

---

## Environments

`APP_ENV` selects the Supabase project **at build time**. `app.config.ts` loads
`.env.$APP_ENV` and bakes the URL and publishable key into the binary. There is
no runtime switch.

| | dev | prod |
|---|---|---|
| `APP_ENV` | `dev` | `prod` |
| Env file | `.env.dev` | `.env.prod` |
| Supabase project | `upwwipwgfzqswjcmqrha` | `fwlnsatdqrtyvvnagbqn` |
| Application id | `com.launchgrid.apps.mydukaan.dev` | `com.launchgrid.apps.mydukaan` |
| Display name | My Dukaan (dev) | My Dukaan |

The ids differ so both builds sit on one phone at once and there is never any
doubt which you are looking at.

`.env.dev` and `.env.prod` are gitignored. `.env.example` is the template.
`.env.prod` ships with blank values so a production build **fails loudly**
until someone fills them in, rather than silently pointing at dev:

```
$ APP_ENV=prod npx expo config
Error: Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY for APP_ENV=prod.
```

The publishable key is not a secret — it is designed to ship in a client. It
grants nothing on its own: every table is unreachable and every RPC checks the
JWT. The service-role key must never appear in this repo or in any build.

---

## First-time setup

```bash
npm install
cp .env.example .env.dev      # fill in from the dev Supabase project
npx expo prebuild --clean     # generates android/ and ios/
```

`android/` and `ios/` are **generated and gitignored**. Never hand-edit them —
any native change belongs in a config plugin or in the `expo-build-properties`
block of `app.config.ts`, or `prebuild --clean` will silently discard it.

WatermelonDB uses a native module, so **Expo Go will not run this app**. You
need a development build:

```bash
npx expo run:android          # builds and installs the dev client
npm start                     # Metro, for subsequent JS-only changes
```

### The local run loop

`npm run dev` wraps both of the above and picks the right one for you. It
checks the connected device for the dev client, does the slow native build
only if it is missing, wires up `adb reverse` so a USB-attached phone can
reach Metro, and then starts Metro.

```bash
npm run dev                   # install if missing, then Metro
npm run dev:build             # force the native rebuild
npm run dev:clear             # Metro with a cleared cache
```

Use `dev:build` after any change to native config — the bundle id, a config
plugin, or a native dependency — since those need a new binary, not a new
bundle. Set `ANDROID_SERIAL=<serial>` to choose between several attached
devices; a physical device is preferred over an emulator by default.

The script derives the package id from `branding.json` exactly as
`app.config.ts` does, so it keeps working when the bundle id changes.

---

## Android — local Gradle build

```bash
export ANDROID_HOME=/d/AppData/AndroidStudio/Local/Android/sdk
export JAVA_HOME=/d/Dev/Java/jdk-17

# Debug, onto a connected device or emulator
npx expo run:android

# Release APK (local testing)
APP_ENV=prod npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease

# Release AAB (Play Store upload)
cd android && ./gradlew bundleRelease
```

Output:
- APK — `android/app/build/outputs/apk/release/app-release.apk`
- AAB — `android/app/build/outputs/bundle/release/app-release.aab`

### Signing

The upload keystore is **not** in this repo and must never be. Generate once:

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore upload-keystore.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Keep it outside the repo, back it up somewhere you will still have in five
years — losing it means you can never update the listing under the same
package name — and reference it from `~/.gradle/gradle.properties`, not from
anything committed:

```properties
MYDUKAAN_UPLOAD_STORE_FILE=/absolute/path/upload-keystore.jks
MYDUKAAN_UPLOAD_KEY_ALIAS=upload
MYDUKAAN_UPLOAD_STORE_PASSWORD=…
MYDUKAAN_UPLOAD_KEY_PASSWORD=…
```

Then wire the `release` signing config in `android/app/build.gradle`. Because
that file is regenerated by prebuild, the durable way to do this is a small
config plugin — write it before the first release rather than re-patching by
hand each time.

### Play Store

1. Bump `version` in `app.config.ts` and `android.versionCode`.
2. `APP_ENV=prod npx expo prebuild --platform android --clean`
3. `cd android && ./gradlew bundleRelease`
4. Upload the AAB to the Play Console → internal testing track first.
5. Promote once the offline path has been exercised on a real budget device.

---

## iOS — GitHub Actions

> **TODO — workflow not yet supplied.**
>
> You mentioned reusing the workflow from an existing project. Drop it in at
> `.github/workflows/ios-release.yml` and adapt:
>
> - **Bundle identifier** → `com.launchgrid.apps.mydukaan` (prod) /
>   `com.launchgrid.apps.mydukaan.dev` (dev). Set in `branding.json`.
> - **Prebuild step** → must run `APP_ENV=prod npx expo prebuild --platform ios
>   --clean` *before* the Xcode build, since `ios/` is not committed.
> - **Env file** → the workflow needs `SUPABASE_URL` and
>   `SUPABASE_PUBLISHABLE_KEY` as repository secrets, written to `.env.prod` in
>   a step before prebuild. These are the publishable values, not the
>   service-role key.
> - **CocoaPods** → `cd ios && pod install` after prebuild. The WatermelonDB
>   plugin adds its pod during prebuild, so the order matters.
> - **Signing** → whatever your existing workflow already does (fastlane match,
>   or an imported p12 + provisioning profile). No change needed on our side.
> - **Deployment target** → 15.1, set in the `expo-build-properties` block of
>   `app.config.ts`. Match it in the workflow if it pins one.
>
> Do **not** add EAS build steps. `eas build` is out of scope for this project;
> the workflow should invoke `xcodebuild` (or fastlane) directly.

Once the workflow is in, record here: what triggers it, where the artefact
lands, and how to get a build onto a tester's phone.

---

## Verifying a build

Before shipping anything, and before Phase 1 starts:

```bash
npm run typecheck                                        # tsc, must be clean
node --env-file=.env.dev scripts/sync-contract-test.mjs  # HTTP contract
# and supabase/tests/security_and_sync.sql against dev
```

### The acceptance test — one device plus an emulator

**This changed with `SYNC_MODE=pull_only`.** The old version of this test put a
phone in airplane mode and expected a customer created there to survive and
sync. That is no longer what the app does, and running it now would fail
correctly: offline writes are off. See
[ADR 0002](adr/0002-sync-mode-flag.md).

What still needs proving is that a write on one device reaches another — which
no longer needs two phones, because the write goes to the server directly.

1. Install the dev build on a device and on an emulator. Sign in as the **same
   account** on both (`owner.a@dev.local` / `devpassword123` on dev).
2. Device A: create a customer. It commits on the server, then the local cache
   refreshes.
3. Device B: within one sync cycle, the customer appears.
4. Device A: turn on airplane mode. Reading still works — everything already
   pulled is in local SQLite, and screens read from there.
5. Device A, still offline: try to create a customer. It must fail with *"Save
   customer" needs a connection*, and must **not** appear in the list. A row
   that showed up and then vanished would be worse than the refusal.
6. Device A: reconnect. Retry the write. It succeeds.

Step 5 is the one worth watching. `src/api/writes.ts` throws
`OfflineWriteBlockedError` before calling anything, and `sync()` additionally
refuses a cycle that finds unexpected local changes — so a screen that wrote to
SQLite directly fails loudly rather than losing the user's work silently.

**When `SYNC_MODE=full` returns**, restore the original test: both devices
offline, different records on each, reconnect both, and neither may overwrite
the other. That is the one that catches a broken sync design, and append-only
ledgers plus device-generated UUIDs are what make it pass.

---

## Troubleshooting

**On Windows, run `gradlew` from PowerShell or cmd — never from Git Bash.**
Cost 15 minutes to diagnose once, and the error names none of this.

`GRADLE_USER_HOME` here is `D:\Dev\.gradle`. Git Bash's MSYS layer rewrites a
Windows path in an environment variable on its way to a child process, turning
that into a *relative* `d/Dev/.gradle`. Gradle resolves it against the project,
creates a second half-populated cache at
`android\d\Dev\.gradle\caches\…\transforms\`, and then fails moving artifacts
into it:

```
Could not move temporary workspace (…\android\d\Dev\.gradle\caches\8.14.3\transforms\<hash>-<uuid>)
to immutable location (…\android\d\Dev\.gradle\caches\8.14.3\transforms\<hash>)
```

The giveaway is `android\d\Dev` in the path — a Windows drive letter that has
become a directory name. Nothing is wrong with the build itself.

Cleaning up needs the extended-length prefix, because those transform paths run
past Windows' 260-character limit and ordinary deletes fail silently:

```powershell
[System.IO.Directory]::Delete("\\?\D:\myapps\mydukaan\mydukaan-mobile\android\d", $true)
```

Then rebuild from PowerShell. Same applies to any tool that reads a path out of
the environment, so prefer PowerShell for native Android work generally.

**Also: don't judge a Gradle build by a piped exit code.** `./gradlew … | tail`
reports `tail`'s status, so a failed build looks like a pass. Either let gradlew
write straight to the terminal, or echo `$LASTEXITCODE` (PowerShell) /
`${PIPESTATUS[0]}` (bash) explicitly and read that.

**`npm run dev` launches a client that crashes on navigation** — the dev client
on the device is stale. `scripts/run-android.mjs` detects *absence*, not
staleness, so it skips the build when a package with the right id is already
installed. The native module set changed when sync was removed (WatermelonDB
went; react-native-screens, react-native-gesture-handler, expo-localization,
expo-print, expo-sharing and expo-file-system arrived), so any client built
before that is missing them. Use `npm run dev:build` to force the rebuild.

**Expo Go shows a red screen about a missing native module** — check the SDK
version first. Since sync was removed every native module the app uses is inside
Expo Go, so `npm start` should work; but Expo Go tracks the latest SDK only, and
this project is pinned to 54. If the installed Expo Go is newer, build the dev
client instead (`npm run dev:build`). This also becomes permanent once
`react-native-purchases` lands for billing — Expo Go will not carry it.

**Gradle cannot find the SDK** — set `ANDROID_HOME`, or write
`sdk.dir=…` into `android/local.properties`.

**`prebuild` wiped a native edit** — that is what it is for. Move the change
into a config plugin or `expo-build-properties`.

**"Couldn't load your shop" on launch** — `get_my_context` failed, and the
whole shell depends on it. Either the account has no profile (an operator has
not onboarded this business yet, or the invite was never claimed), or the
request could not reach the server. The screen offers Retry and Sign out
deliberately rather than falling into the error boundary.

**Lists show another business's data after switching accounts** — the persisted
React Query cache was not cleared on sign-out. `clearCache()` in
`src/data/queryClient.ts` runs before `auth.signOut()`; if that ordering is ever
changed, this is the symptom. Persisted reads are keyed by query, not by user,
so nothing on the server side can prevent it. Verify it every release.
