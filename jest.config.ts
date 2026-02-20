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
    '^.+\\.mjs$': ['@swc/jest', {
      jsc: {
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
  transformIgnorePatterns: ['/node_modules/(?!(@clack)/)'],
};

export default config;
