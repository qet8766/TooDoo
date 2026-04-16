const path = require('path');

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['.'],
        alias: {
          '@shared': path.resolve(__dirname, '..', 'src', 'shared'),
        },
      },
    ],
    'react-native-reanimated/plugin',
  ],
};
