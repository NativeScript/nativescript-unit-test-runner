import { expect, it } from 'vitest';
import './shim.js';

// Kept apart from shim.spec.ts: using the device expect installs it as the
// global expect for the rest of the file.
it.fails('keeps host assertion counting after the shim is imported', () => {
  expect.assertions(1);
});
