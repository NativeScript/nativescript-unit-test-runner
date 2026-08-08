import { View } from '@nativescript/core';

/**
 * Resolves on the next run-loop turn. On the main thread this gives the
 * platform a chance to process layout, paint, and queued native callbacks.
 */
export function nextRenderPass(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export interface WaitUntilOptions {
  timeout?: number;
  interval?: number;
  message?: string;
}

export async function waitUntil(
  condition: () => boolean,
  options: WaitUntilOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? 5_000;
  const interval = options.interval ?? 50;
  const deadline = Date.now() + timeout;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(
        options.message ?? `waitUntil: condition not met within ${timeout}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

export function waitForLayout(view: View, timeout = 5_000): Promise<void> {
  if (view.isLayoutValid) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const handler = (): void => {
      clearTimeout(timer);
      view.off(View.layoutChangedEvent, handler);
      resolve();
    };
    const timer = setTimeout(() => {
      view.off(View.layoutChangedEvent, handler);
      reject(
        new Error(`waitForLayout: no layout pass within ${timeout}ms`),
      );
    }, timeout);
    view.on(View.layoutChangedEvent, handler);
  });
}
