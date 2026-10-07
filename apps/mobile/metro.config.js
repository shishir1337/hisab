const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

// Expo configures monorepo watch folders automatically (SDK 52+).
const config = getDefaultConfig(__dirname)

module.exports = withNativeWind(config, { input: './src/global.css' })
