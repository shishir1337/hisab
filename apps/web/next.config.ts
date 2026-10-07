import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@hisab/core', '@hisab/tokens', '@hisab/db'],
  turbopack: {
    root: path.join(__dirname, '../..'),
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
