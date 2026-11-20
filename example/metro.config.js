// Runs the example against the SDK's source in the folder above, with one copy of React and
// React Native (the example's), as a published install would.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const root = path.resolve(__dirname, "..");
const config = getDefaultConfig(__dirname);
const escape = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

config.watchFolders = [root];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config.resolver.extraNodeModules = { "@usevurp/react-native": root };
config.resolver.disableHierarchicalLookup = true;
config.resolver.blockList = [
  new RegExp(`^${escape(path.join(root, "node_modules"))}\\/.*$`),
];

module.exports = config;
