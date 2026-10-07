const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

// Expo configures monorepo watch folders automatically (SDK 52+).
const config = getDefaultConfig(__dirname)

/**
 * Packages that must exist exactly once in the bundle. The pnpm store can hold a second physical copy
 * (e.g. nativewind's own react-native-css-interop under node_modules/.pnpm): NativeWind would then
 * inject the compiled styles into one copy while components read them from the other, and every
 * className silently renders unstyled. Resolving these from the app keeps a single instance.
 */
const SINGLETONS = ['react-native-css-interop', 'nativewind', 'react', 'react-native']
const appOrigin = path.join(__dirname, 'package.json')
const upstream = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest
  const singleton = SINGLETONS.some((p) => moduleName === p || moduleName.startsWith(p + '/'))
  if (singleton && context.originModulePath.includes(`${path.sep}.pnpm${path.sep}`)) {
    return resolve({ ...context, originModulePath: appOrigin }, moduleName, platform)
  }
  return resolve(context, moduleName, platform)
}

module.exports = withNativeWind(config, { input: './src/global.css' })
