import type { NextConfig } from "next";
import path from "path";

// React's dev mode uses eval() for stack-trace reconstruction (never in
// production builds) — 'unsafe-eval' is only added here for `next dev` so
// the deployed production CSP is untouched.
const scriptSrc =
  process.env.NODE_ENV === "production"
    ? "script-src 'self' 'unsafe-inline';"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval';";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    // connect-src 'self' is safe because the browser never talks to Apps
    // Script directly anymore — all Sheets access goes through server
    // actions on this same origin. style-src stays 'unsafe-inline' because
    // Tailwind v4 injects styles via <style> tags. fonts.googleapis.com/
    // fonts.gstatic.com are allowed because next/font/google falls back to
    // loading Geist live instead of self-hosting it under this build.
    value:
      `default-src 'self'; ${scriptSrc} ` +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com; " +
      "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
