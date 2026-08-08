import { Color, ContentView, GridLayout, Page } from '@nativescript/core';
import type { NativeScriptTestEventSource } from '../protocol.js';
import { VitestResultsView } from '../ui/results-view.js';

let hostView: ContentView | undefined;
const hostWaiters: Array<(host: ContentView) => void> = [];

/**
 * Registers the surface `mount()` attaches views to. Called automatically by
 * `createVitestHostPage`; call it directly when embedding the host in a
 * custom page (e.g. a flavor-specific bootstrap).
 */
export function setTestHost(view: ContentView): void {
  hostView = view;
  while (hostWaiters.length > 0) {
    hostWaiters.shift()?.(view);
  }
}

/** Resolves once a test host surface has been registered. */
export function getTestHost(): Promise<ContentView> {
  if (hostView) return Promise.resolve(hostView);
  return new Promise((resolve) => hostWaiters.push(resolve));
}

/**
 * A page that streams full terminal-style results while keeping a mount
 * surface available for UI specs: the host row is zero-height until a spec
 * mounts a view, so the results own the screen between UI tests.
 */
export function createVitestHostPage(
  source: NativeScriptTestEventSource,
): Page {
  const page = new Page();
  page.actionBarHidden = true;
  page.backgroundColor = new Color('#000000');

  const root = new GridLayout();
  root.rows = 'auto, *';
  root.backgroundColor = new Color('#000000');

  const host = new ContentView();
  GridLayout.setRow(host, 0);
  root.addChild(host);

  const results = new VitestResultsView({ source });
  GridLayout.setRow(results, 1);
  root.addChild(results);

  page.content = root;
  setTestHost(host);
  return page;
}
