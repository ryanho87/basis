# Basis iOS wrapper

Basis includes a Capacitor 8 iOS project that loads the deployed Next.js application. The financial logic, sessions, and updates remain on the Vercel deployment; the wrapper supplies the native container, branded assets, and native Google sign-in.

## Run it

1. Install Xcode and accept its license.
2. Run `npm install` and `npm run ios:sync`.
3. Run `npm run ios:open` and choose an Apple development team in the App target's Signing & Capabilities panel.
4. Build to a simulator or registered device.

Set `BASIS_MOBILE_URL` before `npm run ios:sync` to target a different HTTPS deployment.

## Complete Google sign-in

Create a Google OAuth client of type **iOS** with bundle identifier `com.basisfinance.app`. Then:

1. Add the iOS client ID to Vercel as `GOOGLE_IOS_CLIENT_ID` for Production and Preview, then redeploy.
2. In Xcode, open the App target's Build Settings and set `GOOGLE_IOS_CLIENT_ID` for Debug and Release.
3. Set `GOOGLE_REVERSED_CLIENT_ID` to the iOS client ID with its dot-separated segments reversed, matching Google's generated URL scheme. For example, `123.apps.googleusercontent.com` becomes `com.googleusercontent.apps.123`.
4. Run `npm run ios:sync`, rebuild, and test Google sign-in on a device.

The wrapper obtains a Google ID token natively and sends it to Better Auth for server-side verification. It does not put a Google client secret in the app and does not require a universal-link OAuth callback.

## Release boundary

Capacitor documents `server.url` as a live-reload feature rather than a production packaging strategy. Basis uses it here because the app depends on authenticated Next.js server routes and cannot be statically exported. This is appropriate for an internal/TestFlight build. A public App Store submission still needs Apple signing, archive upload, privacy labels, and an App Review pass for minimum functionality.
