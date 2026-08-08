import type { ContentView, View } from '@nativescript/core';
import { View as ViewClass } from '@nativescript/core';
import { onTestFinished } from '@vitest/runner';
import { getTestHost } from './host.js';
import { nextRenderPass, waitForLayout } from './wait.js';

export interface MountOptions {
  /** Unmount automatically when the current test finishes. Default true. */
  autoUnmount?: boolean;
  timeout?: number;
}

export interface Mounted<T extends View> {
  view: T;
  host: ContentView;
  unmount(): Promise<void>;
}

function withTimeout(
  promise: Promise<void>,
  timeout: number,
  message: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeout);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Attaches a view to the test host surface and resolves after it has loaded
 * and completed a layout pass, so assertions observe a fully realized native
 * view. Requires the main-thread execution context — Worker contexts have no
 * UI thread access.
 */
export async function mount<T extends View>(
  viewOrFactory: T | (() => T),
  options: MountOptions = {},
): Promise<Mounted<T>> {
  const timeout = options.timeout ?? 5_000;
  const host = await withTimeout(
    getTestHost().then(() => undefined),
    timeout,
    'mount: no test host registered — boot the app with createVitestHostPage() (or call setTestHost())',
  ).then(() => getTestHost());

  const view =
    typeof viewOrFactory === 'function'
      ? (viewOrFactory as () => T)()
      : viewOrFactory;

  const loaded = view.isLoaded
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        view.once(ViewClass.loadedEvent, () => resolve());
      });

  host.content = view;
  await withTimeout(loaded, timeout, 'mount: view never fired "loaded"');
  await waitForLayout(view, timeout);

  let unmounted = false;
  const unmount = async (): Promise<void> => {
    if (unmounted) return;
    unmounted = true;
    if (host.content === view) {
      (host as { content: View | null }).content = null;
    }
    await nextRenderPass();
  };

  if (options.autoUnmount !== false) {
    onTestFinished(() => unmount());
  }

  return { view, host, unmount };
}
