module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],   // helpers/ is NOT treated as a test file
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 15000,
  maxWorkers: 1,                               // test files share one database, run them one at a time
};
