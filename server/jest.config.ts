import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/__tests__'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        target: 'ES2020',
        module: 'commonjs',
      },
    }],
  },
  testTimeout: 10000,
  setupFiles: ['<rootDir>/src/__tests__/helpers/setup.ts'],
};

export default config;
