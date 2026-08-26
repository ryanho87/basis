import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.basisfinance.app",
  appName: "Basis",
  webDir: "mobile-shell",
  loggingBehavior: "none",
  backgroundColor: "#09090b",
  ios: {
    preferredContentMode: "mobile",
    contentInset: "automatic",
    allowsLinkPreview: false,
  },
  server: {
    url: process.env.BASIS_MOBILE_URL || "https://basis-finance-rh.vercel.app",
    cleartext: false,
  },
};

export default config;
