/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.(t|j)s$': [
      '@swc/jest',
      {
        jsc: {
          target: 'es2020',
          parser: {
            syntax: 'typescript',
          },
        },
        module: {
          type: 'commonjs',
        },
      },
    ],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!.pnpm/@garmin\\+fitsdk)(?!.*@garmin/fitsdk)',
  ],
  moduleNameMapper: {
    '^@garmin/fitsdk$': '<rootDir>/test/vendor/fitsdk.cjs',
  },
};
