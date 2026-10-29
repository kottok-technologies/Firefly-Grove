# Firefly Grove store artwork

- `firefly-grove-icon-512.png`: opaque, full-square 512 × 512 RGBA PNG for the Google Play Console game icon (under 1 MB).
- `firefly-grove-icon-master.png`: original generated artwork for future exports.
- `icon-prompt.txt`: original generation prompt; the existing game firefly was used as a character reference.

Generated using the built-in image-generation tool. The 512 px upload export was resized with Pillow and checked for dimensions, RGBA mode, opaque edges and file size. Google applies its own icon mask; the artwork contains no pre-rounded corners, outer shadow or lettering. The in-app and Android launcher icons are unchanged. No version bump or app build accompanies this asset.

Requirements: https://developer.android.com/distribute/google-play/resources/icon-design-specifications

## Feature graphic

- `firefly-grove-feature-1024x500.png`: upload-ready 1024 × 500 RGB (24-bit) PNG with no alpha, for both the Google Play listing and Play Games Services feature graphic.
- `firefly-grove-feature-master.png`: original generated landscape artwork matching the approved icon.
- `feature-prompt.txt`: original built-in image-generation prompt.

The upload export was resized with Pillow and checked for exact dimensions, RGB mode and absence of transparency. Text was visually checked: “Firefly Grove” and “A little logic. A little light.” No version bump or app build.

Requirements: https://support.google.com/googleplay/android-developer/answer/9866151
