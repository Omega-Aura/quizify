/** @type {import('next').NextConfig} */

// Backend origin. In production set NEXT_PUBLIC_API_URL to your deployed API
// URL (e.g. https://quizify-api.onrender.com). Falls back to local dev.
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const apiUrl = new URL(API_ORIGIN);

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: apiUrl.protocol.replace(':', ''),
        hostname: apiUrl.hostname,
        port: apiUrl.port || '',
      },
    ],
  },
};

export default nextConfig;
