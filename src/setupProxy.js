const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/whiteboards",
    createProxyMiddleware({
      target: "http://hubs.local:4000",
    }),
  );
};
