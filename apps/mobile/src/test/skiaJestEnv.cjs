const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit');
const { TestEnvironment } = require('jest-environment-node');

// Mirrors @shopify/react-native-skia/jestEnv.mjs: initialize CanvasKit once per
// Jest worker. The deep import above is the same one used by the installed
// @shopify/react-native-skia v2.0.0-next.4 environment.
const canvasKitPromise = CanvasKitInit({});

/**
 * Jest 29 calls `require()` before dynamic import. Node 25 can synchronously
 * require ESM, but rejects Skia's top-level-await environment with
 * ERR_REQUIRE_ASYNC_MODULE before Jest reaches its ESM fallback. Load the
 * exact package-provided environment setup through a stable CommonJS
 * entry point.
 */
module.exports = class SkiaJestEnvironmentCompat extends TestEnvironment {
  async setup() {
    await super.setup();
    this.global.CanvasKit = await canvasKitPromise;
  }

  async teardown() {
    await super.teardown();
  }
};
