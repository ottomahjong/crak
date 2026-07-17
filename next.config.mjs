/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Service worker and manifest are served from /public as static assets.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
