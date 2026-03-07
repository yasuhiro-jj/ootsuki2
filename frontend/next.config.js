/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // バックエンドAPIへのプロキシ（開発環境用）
  async rewrites() {
    // 本番環境では環境変数NEXT_PUBLIC_API_URLを使用
    // 開発環境ではプロキシを使用
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (apiUrl) {
      return [
        {
          source: '/api/proxy/:path*',
          destination: `${apiUrl}/:path*`,
        },
      ];
    }
    // 開発環境のフォールバック
    return [
      {
        source: '/api/proxy/:path*',
        destination: 'http://localhost:8011/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
