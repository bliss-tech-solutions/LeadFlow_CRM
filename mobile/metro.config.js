const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// mobile/ lives inside the website repo but is NOT an npm workspace. Never let
// Metro pick up packages (e.g. the website's React) from the parent folder.
const parentModules = path.resolve(__dirname, "..", "node_modules");
const escapeRegex = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
config.watchFolders = [__dirname];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config.resolver.blockList = [new RegExp(`^${escapeRegex(parentModules)}[\\\\/].*`)];

module.exports = withNativeWind(config, { input: "./global.css" });
