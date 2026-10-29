# Android signing

Distributable builds now use a persistent RSA-3072 release/upload key. Local Gradle builds and GitHub Actions use the same key. APK verification compares the signer against the public fingerprint in [ANDROID_CERTIFICATE.json](ANDROID_CERTIFICATE.json), and refuses mismatches. The public certificate is [firefly-grove-upload-certificate.crt](firefly-grove-upload-certificate.crt).

## Local builds and backup

The private key and credentials live in `android/signing/`, which is ignored by Git. On this Windows workstation, that directory is restricted to the current user and SYSTEM. Back up the **entire signing folder** in your password manager or another encrypted, access-controlled backup. GitHub secrets cannot be downloaded as a backup. Losing the key prevents updates to APKs installed directly with this certificate.

The existing key was generated with `node scripts/setup-android-signing.mjs`. This command refuses to replace an existing key. `node scripts/setup-android-signing.mjs --publish` copies the existing material into GitHub Actions secrets without printing passwords or putting them on command lines.

With `JAVA_HOME` set to a supported JDK:

```powershell
./android/gradlew.bat -p android assembleRelease bundleRelease lintRelease testReleaseUnitTest
$env:ANDROID_HOME="$env:LOCALAPPDATA/Android/Sdk"
node scripts/android-signing.mjs verify
```

The committed leaderboard configuration intentionally has no endpoint. Use the verified production configuration when preparing a connected local build; the CI release workflow configures and checks the API automatically.

Release outputs:

- `android/app/build/outputs/apk/release/app-release.apk`: directly installable APK.
- `android/app/build/outputs/bundle/release/app-release.aab`: Google Play upload bundle.

Release builds fail when signing credentials are unavailable. Normal `assembleDebug` remains a development build and is not the distribution/update channel.

## GitHub Actions

The repository stores `ANDROID_KEYSTORE_BASE64`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` as Actions secrets. Public variables `ANDROID_CERT_SHA256` and `LEADERBOARD_API_URL` pin the certificate and deployed API.

Push CI does not generate signed releases. Manually run **CI** on main with **Build signed APK/AAB artifacts after checks pass** selected to build them after the quality gate. **Signed Android release** can also be dispatched manually on main, without changing AWS resources. The Terraform deployment workflow builds the same signed artifacts after a successful application apply. Download `firefly-grove-connected-apk` from the relevant workflow.

Pull-request builds receive no signing secrets. Release jobs only run on main; runner key files are removed even after a failed build. Never commit the private signing folder or include it in artifacts. The base64 secret is sensitive key material, not encryption.

## Google Play App Signing and Google sign-in

Use **Play App Signing** for the Play Store. This key signs the bundle uploaded to Play; Google normally generates and holds a separate app-signing key for installed Play builds. Download the **app-signing certificate** from Play Console's App integrity / App signing page after enrollment. Register its SHA-1 alongside the direct-install certificate when configuring Google sign-in for `com.fireflygrove.game`.

Upload-signed direct APKs and Google-signed Play installs are separate installation channels. To distribute an APK that can update a Play-installed app, download the Google-signed APK from Play Console. Do not assume the upload certificate is the Play-installed certificate.

Existing debug APKs have different certificates and cannot be updated directly with the new release APK. Android would require an uninstall, which removes guest profiles and progress; account/cloud restoration is not implemented yet. Keep an existing installation if that data must be retained. Once installed with this persistent certificate, later direct release updates can retain data as long as their version codes do not decrease.

Official reference: [Sign your app](https://developer.android.com/studio/publish/app-signing).
