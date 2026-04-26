module.exports = {
  packagerConfig: {
    asar: true,
    icon: "public/images/logo"
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'PixiChat',
        setupIcon: 'public/images/logo.ico'
      },
      platforms: ['win32']
    }
  ]
};