const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Resolve @migo/shared path alias for Metro
config.resolver.extraNodeModules = {
  '@migo/shared': require('path').resolve(__dirname, '../shared'),
};

// Disable package.json "exports" field resolution — prevents Metro from
// picking up ESM-only entry points that contain import.meta syntax.
config.resolver.unstable_enablePackageExports = false;

// Ensure Metro can process .mjs and .cjs files from third-party packages
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'mjs',
  'cjs',
];

config.transformer.unstable_allowRequireContext = true;

module.exports = withNativeWind(config, { input: './global.css' });
