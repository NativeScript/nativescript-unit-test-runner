import { describe, expect, it, vi } from 'vitest';
import {
  installWebEventPolyfill,
  type WebEventGlobal,
} from './web-event-polyfill.js';

interface TestEvent {
  preventDefault(): void;
}

interface TestEventTarget {
  addEventListener(
    type: string,
    listener: (event: TestEvent) => void,
    options?: { once?: boolean },
  ): void;
  removeEventListener(type: string, listener: (event: TestEvent) => void): void;
  dispatchEvent(event: TestEvent): boolean;
}

interface TestAbortSignal extends TestEventTarget {
  readonly aborted: boolean;
  readonly reason: unknown;
  throwIfAborted(): void;
}

interface TestAbortController {
  readonly signal: TestAbortSignal;
  abort(reason?: unknown): void;
}

describe('installWebEventPolyfill', () => {
  it('provides the event surface Vitest uses without replacing host globals', () => {
    const scope: WebEventGlobal = {};
    installWebEventPolyfill(scope);

    const Event = scope.Event as new (type: string) => TestEvent;
    const EventTarget = scope.EventTarget as new () => TestEventTarget;
    const target = new EventTarget();
    const listener = vi.fn((event: TestEvent) => event.preventDefault());
    target.addEventListener('plugin', listener);

    expect(target.dispatchEvent(new Event('plugin'))).toBe(false);
    expect(listener).toHaveBeenCalledOnce();

    target.removeEventListener('plugin', listener);
    expect(target.dispatchEvent(new Event('plugin'))).toBe(true);
    expect(listener).toHaveBeenCalledOnce();

    const existingEvent = scope.Event;
    const existingTarget = scope.EventTarget;
    installWebEventPolyfill(scope);
    expect(scope.Event).toBe(existingEvent);
    expect(scope.EventTarget).toBe(existingTarget);
  });

  it('provides the abort surface used by the Vitest runner', () => {
    const scope: WebEventGlobal = {};
    installWebEventPolyfill(scope);

    const AbortController =
      scope.AbortController as new () => TestAbortController;
    const controller = new AbortController();
    const listener = vi.fn();
    const reason = new Error('cancelled');
    controller.signal.addEventListener('abort', listener, { once: true });

    controller.abort(reason);
    controller.abort(new Error('ignored'));

    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBe(reason);
    expect(listener).toHaveBeenCalledOnce();
    expect(() => controller.signal.throwIfAborted()).toThrow(reason);
  });

  it('defaults an unexplained abort to an AbortError', () => {
    const scope: WebEventGlobal = {};
    installWebEventPolyfill(scope);

    const AbortController =
      scope.AbortController as new () => TestAbortController;
    const controller = new AbortController();
    controller.abort();

    expect((controller.signal.reason as Error).name).toBe('AbortError');
  });
});
