/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a self-contained server bundle in .next/standalone/ so the
  // production Docker image doesn't need node_modules. Drastically smaller.
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["@electric-sql/pglite", "pg", "pg-native", "playwright"],
  },
  // Playwright is dynamically imported in lib code that webpack tries to bundle;
  // marking it external lets the build succeed even when the package isn't
  // installed yet (we add it to package.json + apk-install chromium below).
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push("playwright", "playwright-core");
    }
    return config;
  },
  // Don't fail prod builds on lint or type warnings — type-check is separate (`npm run typecheck`).
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
