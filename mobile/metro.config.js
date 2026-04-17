const path = require('path');
const fs = require('fs');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '..', 'src', 'shared');
const monorepoRoot = path.resolve(projectRoot, '..');

const SHARED_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

const resolveShared = (sub) => {
  const base = path.join(sharedRoot, sub);
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of SHARED_EXTS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  for (const ext of SHARED_EXTS) {
    const candidate = path.join(base, 'index' + ext);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

const config = {
  watchFolders: [sharedRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === '@shared' || moduleName.startsWith('@shared/')) {
        const sub = moduleName === '@shared' ? '' : moduleName.slice('@shared/'.length);
        const filePath = resolveShared(sub);
        if (filePath) return { type: 'sourceFile', filePath };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
