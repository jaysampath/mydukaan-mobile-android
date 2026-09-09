module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // WatermelonDB models use legacy decorators (@field, @date, @relation).
      // This must stay ahead of any other plugin that touches class syntax.
      ['@babel/plugin-proposal-decorators', { legacy: true }],
    ],
  };
};
