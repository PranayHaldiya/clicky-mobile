const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Block Metro from watching tmp directories created by native packages
// that don't exist and cause ENOENT crashes
const blockList = config.resolver.blockList
  ? Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  : [];

config.resolver.blockList = [
  ...blockList,
  /node_modules\/.*_tmp_\d+.*/,
  /\.cache\/openid-client\/.*/,
];

module.exports = config;
