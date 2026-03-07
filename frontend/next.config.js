/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // バックエンドAPIへのプロキシ（オプション）
  async rewrites() {
    return [
      {
        source: '/api/proxy/:path*',
        destination: 'http://localhost:8011/:path*',  // ootsuki2のバックエンドポートに合わせる
      },
    ];
  },
};

module.exports = nextConfig;
