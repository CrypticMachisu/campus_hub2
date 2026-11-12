// CommonJS config with the .cjs extension: the package is "type": "module", so
// a plain jest.config.js was loaded as ESM and died with "module is not
// defined". Naming it .cjs states the module type Node should use.
module.exports = {
  testEnvironment: "node",
  // The version suite is the handout's deliverable. The root __tests__/events
  // harness belongs to a different API shape (paginated body, GET /events/:id)
  // and is left out on purpose; run it explicitly if it is ever revived.
  testMatch: ["**/__tests__/versions.test.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testTimeout: 15000,
  maxWorkers: 1, // test files share one database, run them one at a time
};
