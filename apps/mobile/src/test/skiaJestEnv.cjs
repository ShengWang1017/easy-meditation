const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit');
const { TestEnvironment } = require('jest-environment-node');

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
    this.global.CanvasKit = await CanvasKitInit({});
  }

  async teardown() {
    await super.teardown();
  }
};
