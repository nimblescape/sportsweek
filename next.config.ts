import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxies Firebase's OAuth sign-in helper through our own domain so signInWithRedirect
  // doesn't rely on a cross-origin iframe to *.firebaseapp.com — required since
  // Chrome 115+/Firefox 109+/Safari 16.1+ block that third-party storage access by default.
  // See https://firebase.google.com/docs/auth/web/redirect-best-practices (Option 3).
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: "https://htld-sportsweek.firebaseapp.com/__/auth/:path*",
      },
    ];
  },
};

export default nextConfig;
