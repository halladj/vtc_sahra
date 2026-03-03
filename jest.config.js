const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  // Collect coverage only from source files, excluding generated and config
  collectCoverageFrom: [
    "src/api/**/*.ts",
    "src/middlewares/**/*.ts",
    "!src/**/__test__/**",
    "!src/generated/**",
    "!src/swagger.ts",
  ],
  // Per-file minimum thresholds for critical modules
  // Run: npx jest --coverage to enforce these
  coverageThreshold: {
    "./src/api/rating/rating.services.ts": {
      branches: 90,
      functions: 100,
      lines: 90,
      statements: 90,
    },
    "./src/api/rating/rating.route.ts": {
      branches: 85,
      functions: 100,
      lines: 85,
      statements: 85,
    },
    "./src/api/wallet/wallet.services.ts": {
      branches: 85,
      functions: 100,
      lines: 85,
      statements: 85,
    },
    "./src/api/giftcard/giftcard.services.ts": {
      branches: 85,
      functions: 100,
      lines: 85,
      statements: 85,
    },
    "./src/middlewares/middlewares.ts": {
      branches: 80,
      functions: 75, // multer filename callback requires real file upload, unit-testable portion is 75%
      lines: 90,
      statements: 90,
    },
  },
};