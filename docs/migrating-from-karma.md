# Migrating from Karma to Vitest

`@nativescript/unit-test-runner` v5 replaces the Karma-based on-device runner
(v4 and below). Karma support in the NativeScript CLI is deprecated and will
be removed one release cycle after v5 ships.

## 1. Remove the Karma toolchain

```bash
npm rm karma karma-jasmine karma-mocha karma-chai karma-qunit \
  karma-coverage karma-nativescript-launcher karma-webpack \
  @jsdevtools/coverage-istanbul-loader nyc
rm karma.conf.js
```

Also remove any `hostname: '127.0.0.1'` Node 17 workaround notes you may have
carried in `karma.conf.js` — the Vitest bridge does not use Karma's server.

## 2. Re-initialize

```bash
ns test init --framework vitest
```

This installs `vitest`, `@vitest/runner`, and
`@nativescript/unit-test-runner@^5` as devDependencies, plus
`@valor/nativescript-websockets` as a regular dependency (it carries native
code, which the CLI only integrates for regular dependencies), then scaffolds:

- `vitest.config.mts` — platform comes from `NS_PLATFORM` (set by `ns test`)
- `app/test.ts` — the on-device entry (coordinator + spec registry + host page)
- `app/tests/example.spec.ts`
- `tsconfig.spec.json` (TypeScript projects)

Your existing `app/**/*.spec.ts` files are picked up by the same glob as
before. If you kept specs elsewhere, align the Vitest `include` patterns and
the `require.context` filter in `app/test.ts`.

## 3. Update spec syntax

Jasmine and Mocha suites are structurally compatible (`describe`/`it`), with
these changes:

| Before | After |
| --- | --- |
| global `describe`/`it`/`expect` | `import { describe, expect, it } from 'vitest'` |
| Jasmine `spyOn(obj, 'm')` | `vi.spyOn` (planned) or manual stubs / DI |
| Jasmine `fail('msg')` | `expect.unreachable('msg')` or throw |
| Mocha + Chai `assert`/`should` | Vitest `expect` (Chai-compatible `expect(x).to.…` also works) |
| `beforeEach(done => …)` callbacks | async functions |
| QUnit suites | rewrite to `describe`/`it` |

Vitest's `expect` implements the Jest matcher API, and jasmine's
`expect(x).toBe(y)`-style assertions work unchanged.

## 4. Coverage

`--env.codeCoverage` still works (`ns test ios --env.codeCoverage`), now
backed by `@vitest/coverage-istanbul`. Configure reporters in
`vitest.config.mts` under `test.coverage`. `nyc` is no longer needed.

## 5. CI

Replace `ns test <platform> --justlaunch`-style invocations with either
`ns test <platform>` or `NS_PLATFORM=<platform> npx vitest run`. The process
exit code reflects the test result, and every Vitest reporter (including
`--reporter=junit`) is available.

## Behavior differences

- Specs still run on the app's main thread by default, exactly like Karma —
  existing suites that touch UI keep working, and the new
  `@nativescript/unit-test-runner/testing` helpers (`mount`, `tap`, …) make
  UI tests first-class.
- `--watch` is not yet supported for on-device runs (one-shot only for now).
- `vi.mock` module mocking is not supported (specs are webpack-bundled);
  prefer dependency injection.
- The runner package is now a devDependency — it no longer patches
  `Info.plist`/`AndroidManifest.xml` via plugin hooks. Emulator/simulator runs
  need no manifest changes in most cases; for physical devices see the README
  "Devices and networking" section.
