// Jest runs from a "type": "module" package, but its runtime only executes
// CommonJS. Babel compiles the tests and the server's ESM sources down to CJS
// for the test run, which is what lets a bare `npx jest` work with no
// --experimental-vm-modules flag.
//
// Nothing else reads this file: the app runs on Node's native ESM and the Vite
// build has its own transform, so production behaviour is unaffected.
module.exports = {
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
};
