let runTests: () => unknown;

export function registerTestRunner(testRunner: () => unknown) {
  runTests = testRunner;
}


export function executeWebpackTests() {
    runTests?.();
}
