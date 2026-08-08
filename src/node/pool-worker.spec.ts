import { describe, expect, it } from 'vitest';
import type { WorkerRequest } from 'vitest/node';
import { NativeScriptPoolWorker } from './pool-worker.js';
import type { NativeScriptPoolSession } from './session.js';

class FakeSession implements NativeScriptPoolSession {
  retained = 0;
  released = 0;
  sent: Array<{ slot: number; message: unknown }> = [];
  waitError: Error | undefined;
  private listener: ((message: unknown) => void) | undefined;

  retain(): void {
    this.retained += 1;
  }

  async release(): Promise<void> {
    this.released += 1;
  }

  async start(): Promise<void> {}

  async waitForWorker(_slot: number): Promise<void> {
    if (this.waitError) throw this.waitError;
  }

  send(slot: number, message: unknown): void {
    this.sent.push({ slot, message });
  }

  subscribe(_slot: number, listener: (message: unknown) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }

  emit(message: unknown): void {
    this.listener?.(message);
  }
}

function request(type: WorkerRequest['type']): WorkerRequest {
  return { __vitest_worker_request__: true, type } as WorkerRequest;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('NativeScriptPoolWorker', () => {
  it('acknowledges startup immediately and then forwards to its slot', async () => {
    const session = new FakeSession();
    const worker = new NativeScriptPoolWorker(2, session);
    const responses: unknown[] = [];
    worker.on('message', (message) => responses.push(message));

    worker.send(request('start'));
    await flush();

    expect(responses).toContainEqual({
      __vitest_worker_response__: true,
      type: 'started',
    });
    expect(session.sent).toEqual([{ slot: 2, message: request('start') }]);
  });

  it('relays device responses and releases the shared session once', async () => {
    const session = new FakeSession();
    const worker = new NativeScriptPoolWorker(0, session);
    const responses: unknown[] = [];
    worker.on('message', (message) => responses.push(message));
    session.emit({ result: 'passed' });

    await worker.stop();
    await worker.stop();

    expect(responses).toEqual([{ result: 'passed' }]);
    expect(session.retained).toBe(1);
    expect(session.released).toBe(1);
  });

  it('stops relaying device responses to detached listeners', async () => {
    const session = new FakeSession();
    const worker = new NativeScriptPoolWorker(0, session);
    const responses: unknown[] = [];
    const listener = (message: unknown): void => {
      responses.push(message);
    };
    worker.on('message', listener);
    worker.off('message', listener);
    session.emit({ result: 'passed' });

    expect(responses).toEqual([]);
  });

  it('forwards shutdown so device-side worker cleanup can finish', async () => {
    const session = new FakeSession();
    const worker = new NativeScriptPoolWorker(1, session);

    worker.send(request('stop'));
    await flush();

    expect(session.sent).toEqual([{ slot: 1, message: request('stop') }]);
  });

  it('reports a slot that never connects as a finished test file', async () => {
    const session = new FakeSession();
    session.waitError = new Error('worker 3 did not connect');
    const worker = new NativeScriptPoolWorker(3, session);
    const responses: unknown[] = [];
    worker.on('message', (message) => responses.push(message));

    worker.send(request('run'));
    await flush();

    expect(responses).toEqual([
      {
        __vitest_worker_response__: true,
        type: 'testfileFinished',
        error: session.waitError,
      },
    ]);
    expect(session.sent).toEqual([]);
  });
});
