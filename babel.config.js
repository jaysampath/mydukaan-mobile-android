module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo handles expo-router; the separate expo-router/babel
    // plugin was removed in SDK 50 and adding it back is an error.
    //
    // There is deliberately no decorators plugin any more. It existed only for
    // WatermelonDB's @field/@date/@relation model accessors -- see
    // docs/adr/0003-remove-offline-sync.md.
    presets: ['babel-preset-expo'],
  };
};
