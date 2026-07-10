// Metro config for the Expo app inside an npm-workspaces monorepo.
// Lets Metro watch the workspace root and resolve packages hoisted to the
// root node_modules (e.g. the symlinked @easy-meditation/shared package,
// which is consumed as its built dist/ per its package.json "exports").
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
const { assetExts, sourceExts } = config.resolver;

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.transformer.babelTransformerPath = require.resolve(
  'react-native-svg-transformer/expo',
);
config.resolver.assetExts = assetExts.filter(
  (extension) => extension !== 'svg',
);
config.resolver.sourceExts = [...sourceExts, 'svg'];

module.exports = config;
