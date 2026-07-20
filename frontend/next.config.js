/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow the frontend container/dev server to proxy API calls if desired.
  async rewrites() {
    const api = process.env.API_PROXY_TARGET;
    if (!api) return [];
    return [{ source: "/proxy/:path*", destination: `${api}/:path*` }];
  },
};

module.exports = nextConfig;
