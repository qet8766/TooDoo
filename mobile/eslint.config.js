// Flat config so ESLint stops searching upward and never picks up the repo
// root eslint.config.js (which ignores mobile/ entirely).
const reactNativeConfig = require('@react-native/eslint-config/flat')

module.exports = [{ ignores: ['android/**', 'coverage/**'] }, ...reactNativeConfig]
