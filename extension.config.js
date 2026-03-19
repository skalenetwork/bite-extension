/** @type {import('extension').FileConfig} */
const profile = (name) => `./dist/extension-profile-${name}`

export default {
  browser: {
    chrome: {profile: profile('chrome')},
    chromium: {profile: profile('chromium')},
    edge: {profile: profile('edge')},
    firefox: {profile: profile('firefox')},
    'chromium-based': {profile: profile('chromium-based')},
    'gecko-based': {profile: profile('gecko-based')}
  },
  // Configure bundler to handle large dependencies
  bundler: {
    config: (config) => {
      // Disable __filename/__dirname warnings from dependencies
      config.node = {
        __filename: false,
        __dirname: false
      }
      
      // Disable performance warnings - ethers.js + BITE are inherently large
      config.performance = false
      
      return config
    },
    // Ignore specific warnings from node_modules
    warnings: {
      ignore: [
        // Ignore __filename warnings from @skalenetwork packages
        /__filename is used and has been mocked/
      ]
    }
  }
}
