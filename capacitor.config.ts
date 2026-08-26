import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.basisfinance.app",
  appName: "Basis",
  webDir: "mobile-shell",
  loggingBehavior: "none",
  ios: {
    preferredContentMode: "mobile",
    contentInset: "never",
    allowsLinkPreview: false,
  },
  server: {
    url: process.env.BASIS_MOBILE_URL || "https://basis-finance-rh.vercel.app",
    cleartext: false,
  },
};

export default config;
