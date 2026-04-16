const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '..', 'src', 'shared');
const monorepoRoot = path.resolve(projectRoot, '..');

const config = {
  watchFolders: [sharedRoot],
  resolver: {
    // Let Metro find node_modules in both mobile/ and the project root
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    // Map @shared imports to the actual shared directory
    extraNodeModules: {
      '@shared': sharedRoot,
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
