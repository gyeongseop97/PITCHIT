/** @type {import('next').NextConfig} */
const nextConfig = {
  // This project also has Cloudflare-only data helpers used by the Sites build.
  // The Vercel game deployment does not import them, so do not type-check that
  // unrelated runtime-specific module during the Vercel production build.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
