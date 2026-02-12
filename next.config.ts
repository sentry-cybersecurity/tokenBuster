import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide dev indicators like "Fast Refresh" in the corner
  devIndicators: {
    buildActivity: false,
  },
  async rewrites() {
    const fetcherBaseUrl = process.env.MODEL_FETCHER_BASE_URL || 'http://model-fetcher:3100';
    return [
      {
        source: '/api/models',
        destination: `${fetcherBaseUrl}/models.json`,
      },
      {
        source: '/api/model_metadata/:path*',
        destination: `${fetcherBaseUrl}/model_metadata/:path*`,
      },
      {
        source: '/api/hf/:path*',
        destination: `${fetcherBaseUrl}/hf/:path*`,
      },
      {
        source: '/api/fetcher-health',
        destination: `${fetcherBaseUrl}/health`,
      },
    ];
  },

  webpack(config, { isServer }) {
    // Enable async WebAssembly support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
};

export default nextConfig;
