/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NODE_ENV === "production" ? "standalone" : undefined,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
