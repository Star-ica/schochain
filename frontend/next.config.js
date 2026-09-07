/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Stubs broken Tempo connector internal — bare 'accounts' import
      // in @wagmi/core@3.6.4 tempo/Connectors.js is a build artifact bug
      accounts: false,
    };

    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@metamask/connect-evm': false,
      '@metamask/sdk': false,
      '@walletconnect/ethereum-provider': false,
      '@walletconnect/modal': false,
    };

    return config;
  },
};

module.exports = nextConfig;