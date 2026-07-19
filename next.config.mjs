/** @type {import('next').NextConfig} */

// GitHub Pages serves a project site under a subpath, e.g.
// https://<user>.github.io/crak/ . basePath makes Next emit its asset URLs with
// that prefix; override with PAGES_BASE_PATH (set it to "" for a user/root site
// or a custom domain).
const basePath = process.env.PAGES_BASE_PATH ?? "/crak";

const nextConfig = {
  output: "export", // fully static site for GitHub Pages
  reactStrictMode: true,
  basePath: basePath || undefined,
  trailingSlash: true, // Pages serves <dir>/index.html cleanly
  images: { unoptimized: true }, // no image optimization server on Pages
  // Exposed to the client (service worker registration, manifest/icon hrefs).
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
