import type { Config } from 'jest';

const config: Config = {
  transform: {
    '^.+\\.tsx?$': ['@swc/jest', {
      jsc: {
        parser: {
          syntax: 'typescript',
        },
        target: 'es2022',
      },
      module: {
        type: 'es6',
      },
    }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/evals/datasets/'],
  modulePathIgnorePatterns: ['<rootDir>/evals/datasets/'],
  coveragePathIgnorePatterns: ['/node_modules/', 'lib/agents\\.ts', 'lib/logger\\.ts', 'lib/runner\\.ts'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 99,
      lines: 99,
      statements: 99,
    },
  },
};

export default config;
