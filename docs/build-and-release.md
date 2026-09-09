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

### The Phase 0 acceptance test — on two real devices

This is the gate. It is not a unit test and cannot be automated meaningfully,
because the thing being tested is a phone with no signal.

1. Install the dev build on two devices. Sign in to the **same account** on both.
2. Device A: enable airplane mode.
3. Device A: add a customer. It must appear in the list **immediately** — no
   spinner, no delay. The sync bar reads *Offline — your work is saved on this
   phone* and the row is badged `on device`.
4. Device B (online): the customer is not there yet. Correct.
5. Device A: turn airplane mode off.
6. Within a few seconds: A's row flips to `synced`; B's list shows the customer.
7. Now the harder half — do step 2–3 on **both** devices while both are
   offline, with different names. Reconnect both. Both records must survive on
   both devices. Neither may overwrite the other.

Step 7 is the one that catches a broken sync design. Append-only ledgers plus
device-generated UUIDs are what make it pass.

---

## Troubleshooting

**`Expo Go` shows a red screen about a missing native module** — expected.
WatermelonDB needs a development build. Use `npx expo run:android`.

**Gradle cannot find the SDK** — set `ANDROID_HOME`, or write
`sdk.dir=…` into `android/local.properties`.

**`prebuild` wiped a native edit** — that is what it is for. Move the change
into a config plugin or `expo-build-properties`.

**Model properties read back `undefined`** — `useDefineForClassFields` has been
turned on in `tsconfig.json`. It must stay `false`, or ES2022 class-field
semantics overwrite the accessors WatermelonDB's decorators install.

**Sync fails with `caller is not an active member of any business`** — the
signed-in user has no profile yet. Call `bootstrap_business` (the app does this
on the naming screen).

**`Diverged from server`** — should not happen: the server sends everything as
`updated` and the client runs `sendCreatedAsUpdated`. If it does, the local
database and the cursor disagree; capture the state before clearing it, because
that is a real bug worth understanding.
