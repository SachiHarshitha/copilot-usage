import { getSecurityHeaders } from './src/lib/security-headers';

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: getSecurityHeaders(process.env.NODE_ENV === 'production'),
      },
    ];
  },
};

export default nextConfig;
