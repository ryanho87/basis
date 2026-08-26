# Basis iOS wrapper

Basis includes a Capacitor 8 iOS project that loads the deployed Next.js application. It is intentionally a thin internal/TestFlight wrapper: the financial logic, sessions, and updates remain on the Vercel deployment.

## Run it

1. Install Xcode and accept its license.
2. Run `npm install`.
3. Run `npm run ios:sync`.
4. Run `npm run ios:open` and choose an Apple development team in the App target's Signing & Capabilities panel.
5. Build to a simulator or registered device.

Set `BASIS_MOBILE_URL` before `npm run ios:sync` to target a different HTTPS deployment.

## Known release boundary

Capacitor documents `server.url` as a live-reload feature rather than a production packaging strategy. Basis uses it here because the app depends on authenticated Next.js server routes and cannot be statically exported. Treat this project as an internal prototype. Before a public App Store submission, add a production mobile authentication flow (Google OAuth via system browser and a universal-link callback), branded app icons/splash assets, an offline/error screen, and an Apple review pass for minimum functionality.

Email/password authentication stays within the wrapper. Google OAuth may hand off to the system browser and requires the universal-link callback work above before it is dependable in a signed build.
