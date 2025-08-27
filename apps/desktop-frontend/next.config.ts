import type { NextConfig } from 'next'
const isDev = process.env.NODE_ENV === 'development'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  assetPrefix: isDev ? '' : '/desktop_frontend/',
}

export default nextConfig
