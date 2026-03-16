/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NODE_ENV === "production" ? "standalone" : undefined,
};

export default nextConfig;
