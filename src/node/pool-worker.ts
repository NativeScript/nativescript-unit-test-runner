import type { PoolTask, PoolWorker, WorkerRequest } from 'vitest/node';
import type { NativeScriptPoolSession } from './session.js';

type EventCallback = (argument: unknown) => void;

export class NativeScriptPoolWorker implements PoolWorker {
  readonly name = 'nativescript';
  readonly reportMemory = false;

  private readonly listeners = new Map<string, Set<EventCallback>>();
  private readonly unsubscribe: () => void;
  private stopped = false;

  constructor(
    private readonly slot: number,
    private readonly session: NativeScriptPoolSession,
  ) {
    session.retain();
    this.unsubscribe = session.subscribe(slot, (message) => {
      this.emit('message', message);
    });
  }

  on(event: string, callback: EventCallback): void {
    let callbacks = this.listeners.get(event);
    if (!callbacks) {
      callbacks = new Set();
      this.listeners.set(event, callbacks);
    }
    callbacks.add(callback);
  }

  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  deserialize(data: unknown): unknown {
    return data;
  }

  async start(): Promise<void> {
    await this.session.start();
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.unsubscribe();
    await this.session.release();
  }

  canReuse(_task: PoolTask): boolean {
    return true;
  }

  send(message: WorkerRequest): void {
    if (message.type === 'start') {
      this.emit('message', {
        __vitest_worker_response__: true,
        type: 'started',
      });
    }
    void this.forwardWhenReady(message);
  }

  private async forwardWhenReady(message: WorkerRequest): Promise<void> {
    try {
      await this.session.start();
      await this.session.waitForWorker(this.slot);
      this.session.send(this.slot, message);
    } catch (error) {
      this.emit('message', {
        __vitest_worker_response__: true,
        type: message.type === 'stop' ? 'stopped' : 'testfileFinished',
        error,
      });
    }
  }

  private emit(event: string, argument: unknown): void {
    this.listeners.get(event)?.forEach((callback) => callback(argument));
  }
}
