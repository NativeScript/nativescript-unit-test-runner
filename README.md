# @nativescript/unit-test-runner

Run [Vitest](https://vitest.dev) unit **and UI** tests inside real NativeScript
runtimes on Android, iOS, and visionOS.

Vitest stays on your machine as the orchestrator — configuration, CLI,
reporters, `--ui`, coverage, and editor integrations all work as usual — while
your specs execute on device/emulator inside the actual V8/JSC runtimes, with
full access to native APIs and the NativeScript UI layer.

> Version 5 is a complete rewrite. Karma-based testing (v4 and below) is
> deprecated; see the [migration guide](./docs/migrating-from-karma.md).

## Quick start

```bash
ns test init --framework vitest
ns test ios       # or: ns test android / ns test visionos
```

Or run Vitest directly (what editor extensions and CI use):

```bash
NS_PLATFORM=ios npx vitest run
```

## How it works

- A Vitest plugin installs a custom pool that forwards Vitest's standard
  worker protocol over a WebSocket bridge (bound to `127.0.0.1`).
- The plugin launches your app via `ns run <platform> --no-hmr
  --env.unitTesting`; the webpack helper (auto-discovered from this package)
  swaps the bundle entry to your `test.ts` for test builds only.
- On device, a coordinator connects back to the host and executes specs:
  - **Main-thread context (default):** specs run on the UI thread, so they can
    create Views, navigate Frames, and use every NativeScript API.
  - **Worker contexts (opt-in):** additional isolated NativeScript `Worker`
    runtimes for parallel, non-UI specs.
- Results flow through Vitest's normal RPC, so every reporter works unchanged.

## Configuration

```ts
// vitest.config.mts
import { defineConfig } from 'vitest/config';
import { nativeScript } from '@nativescript/unit-test-runner';

export default defineConfig({
  plugins: [
    nativeScript({
      platform: process.env.NS_PLATFORM || 'ios', // 'android' | 'ios' | 'visionos'
      device: process.env.NS_DEVICE || undefined,
      // workers: 2,          // extra Worker runtimes for non-UI specs
      // mainThread: false,   // disable the UI-capable slot (workers only)
      // port: 17878,
      // launch: false,       // attach to an app you run yourself
    }),
  ],
});
```

Per-platform setups are possible with [Vitest projects](https://vitest.dev/guide/projects)
— give each project its own `nativeScript({ platform })` plugin instance.

## UI testing

```ts
import { describe, expect, it } from 'vitest';
import { Button } from '@nativescript/core';
import { mount, tap } from '@nativescript/unit-test-runner/testing';

describe('counter button', () => {
  it('increments on tap', async () => {
    let count = 0;
    const { view } = await mount(() => {
      const button = new Button();
      button.text = 'Count';
      button.on('tap', () => (count += 1));
      return button;
    });

    await tap(view);
    expect(count).toBe(1);
    expect(view.isLayoutValid).toBe(true);
  });
});
```

`mount()` attaches the view to the host page scaffolded in your `test.ts`,
waits for `loaded` + a real layout pass, and auto-unmounts when the test
finishes. Also available from `./testing`: `tap`, `doubleTap`, `longPress`,
`enterText`, `returnPress`, `waitForLayout`, `waitUntil`, `nextRenderPass`.

UI specs require the main-thread context (the default). Files routed to
Worker contexts must not touch Views.

## Coverage

```bash
ns test ios --env.codeCoverage
# or: NS_PLATFORM=ios npx vitest run --coverage
```

Use the `istanbul` provider — device runtimes do not expose V8 coverage:

```ts
test: {
  coverage: { provider: 'istanbul', reporter: ['text', 'lcov'] },
},
```

## Devices and networking

| Target | Transport |
| --- | --- |
| iOS / visionOS simulator | host loopback (`127.0.0.1`) |
| Android emulator | `10.0.2.2` → host loopback |
| Physical Android | USB via automatic `adb reverse` |
| Physical iOS / Apple Vision Pro | pass a LAN-reachable `url` to the coordinator in `test.ts` |

The host server binds `127.0.0.1` by default. Test builds on Android may need
a scoped cleartext exception for `10.0.2.2`/`127.0.0.1`; on iOS and visionOS,
`NSAllowsLocalNetworking`.

## Support matrix

| Feature | Status |
| --- | --- |
| `describe` / `it` / hooks / `expect` | ✅ |
| Reporters, `vitest --ui`, JUnit output | ✅ |
| Istanbul coverage | ✅ |
| UI testing (`mount`, gestures) | ✅ main-thread context |
| `vi.fn` / `vi.spyOn` / fake timers | 🚧 planned |
| Snapshots | 🚧 planned |
| Watch mode | 🚧 planned (one-shot `vitest run` today) |
| `vi.mock` module mocking | ❌ not supported (webpack static bundle) — prefer DI |

## Credits

The host↔device bridge design originates from
[`@cross-code/vitest-ns`](https://github.com/listepo/cross-code) by
[@listepo](https://github.com/listepo) (MIT). Thank you!

## License

Apache-2.0
