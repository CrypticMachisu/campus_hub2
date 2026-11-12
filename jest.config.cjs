// CommonJS config with the .cjs extension: the package is "type": "module", so
// a plain jest.config.js was loaded as ESM and died with "module is not
// defined". Naming it .cjs states the module type Node should use.
module.exports = {
  testEnvironment: "node",
  // Only the version suite. The old events/clubs harness asserted a contract
  // this API never had ({data,total,page,limit}, GET /events/:id,
  // GET /clubs/:id, clubs search/category filters, {error,message} bodies), and
  // had never run. It was removed rather than ported: server/tests/ already
  // covers those routes against the real shape.
  testMatch: ["**/__tests__/versions.test.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testTimeout: 15000,
  maxWorkers: 1, // test files share one database, run them one at a time
};
