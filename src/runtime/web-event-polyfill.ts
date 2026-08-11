type NativeScriptEventListener =
  | ((event: NativeScriptWebEvent) => unknown)
  | { handleEvent(event: NativeScriptWebEvent): unknown };

class NativeScriptWebEvent {
  readonly type: string;
  target: object | null = null;
  currentTarget: object | null = null;
  defaultPrevented = false;

  constructor(type: string) {
    this.type = type;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

class NativeScriptWebEventTarget {
  private readonly listeners = new Map<
    string,
    Map<NativeScriptEventListener, boolean>
  >();

  addEventListener(
    type: string,
    listener: NativeScriptEventListener | null,
    options?: boolean | { once?: boolean },
  ): void {
    if (!listener) return;
    const listeners = this.listeners.get(type) ?? new Map();
    listeners.set(
      listener,
      typeof options === 'object' && options.once === true,
    );
    this.listeners.set(type, listeners);
  }

  removeEventListener(
    type: string,
    listener: NativeScriptEventListener | null,
  ): void {
    if (!listener) return;
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: NativeScriptWebEvent): boolean {
    event.target = this;
    event.currentTarget = this;
    const listeners = this.listeners.get(event.type) ?? new Map();
    for (const [listener, once] of listeners) {
      if (typeof listener === 'function') listener.call(this, event);
      else listener.handleEvent(event);
      if (once) listeners.delete(listener);
    }
    return !event.defaultPrevented;
  }
}

class NativeScriptAbortSignal extends NativeScriptWebEventTarget {
  aborted = false;
  reason: unknown;
  onabort: ((event: NativeScriptWebEvent) => unknown) | null = null;

  abort(reason: unknown): void {
    if (this.aborted) return;
    this.aborted = true;
    this.reason = reason;
    const event = new NativeScriptWebEvent('abort');
    this.onabort?.(event);
    this.dispatchEvent(event);
  }

  throwIfAborted(): void {
    if (this.aborted) throw this.reason;
  }
}

class NativeScriptAbortController {
  readonly signal = new NativeScriptAbortSignal();

  abort(reason: unknown = createAbortError()): void {
    this.signal.abort(reason);
  }
}

function createAbortError(): Error {
  const error = new Error('This operation was aborted');
  error.name = 'AbortError';
  return error;
}

export interface WebEventGlobal {
  AbortController?: unknown;
  AbortSignal?: unknown;
  Event?: unknown;
  EventTarget?: unknown;
}

/** Install the Web Event API surface required by Vitest on NativeScript. */
export function installWebEventPolyfill(
  scope: WebEventGlobal = globalThis,
): void {
  if (typeof scope.Event !== 'function') scope.Event = NativeScriptWebEvent;
  if (typeof scope.EventTarget !== 'function') {
    scope.EventTarget = NativeScriptWebEventTarget;
  }
  if (typeof scope.AbortSignal !== 'function') {
    scope.AbortSignal = NativeScriptAbortSignal;
  }
  if (typeof scope.AbortController !== 'function') {
    scope.AbortController = NativeScriptAbortController;
  }
}

installWebEventPolyfill();
