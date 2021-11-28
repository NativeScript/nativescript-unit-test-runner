let runTests: () => unknown;

export function registerTestRunner(testRunner: () => unknown | Promise<unknown>) {
  runTests = testRunner;
}


export async function executeWebpackTests() {
    await runTests?.();
}
