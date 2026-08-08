import {
  Color,
  GridLayout,
  Image,
  ImageSource,
  Label,
  ScrollView,
  StackLayout,
  View,
} from '@nativescript/core';
import { Page } from '@nativescript/core';
import type {
  NativeScriptTestDescriptor,
  NativeScriptTestEventSource,
  NativeScriptTestState,
} from '../protocol.js';
import { NATIVESCRIPT_LOGO_BASE64 } from './logo.js';

export interface VitestResultsViewOptions {
  source?: NativeScriptTestEventSource;
}

const COLORS = {
  background: new Color('#000000'),
  bar: new Color('#111111'),
  text: new Color('#e4e4e7'),
  dim: new Color('#71717a'),
  pass: new Color('#4ade80'),
  fail: new Color('#f87171'),
  skip: new Color('#a78bfa'),
  running: new Color('#60a5fa'),
  errorBg: new Color('#1c1113'),
};

const MONO = 'Menlo, Consolas, monospace';

function stateGlyph(state: NativeScriptTestState): string {
  switch (state) {
    case 'passed':
      return '✓';
    case 'failed':
      return '×';
    case 'skipped':
      return '↓';
    case 'todo':
      return '☐';
    case 'running':
      return '●';
    default:
      return '·';
  }
}

function stateColor(state: NativeScriptTestState): Color {
  switch (state) {
    case 'passed':
      return COLORS.pass;
    case 'failed':
      return COLORS.fail;
    case 'skipped':
    case 'todo':
      return COLORS.skip;
    case 'running':
      return COLORS.running;
    default:
      return COLORS.dim;
  }
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1) return '0ms';
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Vitest fullName is `<file task name> > suites > test`, and the file task
 * name is the spec's relative path — redundant under the file header line.
 */
function displayName(descriptor: NativeScriptTestDescriptor): string {
  const separatorIndex = descriptor.fullName.indexOf(' > ');
  if (separatorIndex === -1) return descriptor.fullName;
  const firstSegment = descriptor.fullName.slice(0, separatorIndex);
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(firstSegment)) {
    return descriptor.fullName.slice(separatorIndex + 3);
  }
  return descriptor.fullName;
}

function shortFilePath(filepath: string): string {
  const normalized = filepath.replaceAll('\\', '/');
  const appIndex = normalized.lastIndexOf('/app/');
  if (appIndex !== -1) return normalized.slice(appIndex + 1);
  const srcIndex = normalized.lastIndexOf('/src/');
  if (srcIndex !== -1) return normalized.slice(srcIndex + 1);
  const segments = normalized.split('/');
  return segments.slice(-2).join('/');
}

interface TestRow {
  descriptor: NativeScriptTestDescriptor;
  line: Label;
  errorLabel?: Label;
  container: StackLayout;
}

interface FileSection {
  path: string;
  header: Label;
  container: StackLayout;
  rows: Map<string, TestRow>;
}

/**
 * Streams test progress on-device in the style of Vitest's terminal
 * reporter: file sections, one line per test with state glyph and duration,
 * failure details inline, and a final summary block.
 */
export class VitestResultsView extends GridLayout {
  private readonly headerLabel = new Label();
  private readonly countsLabel = new Label();
  private readonly scroll = new ScrollView();
  private readonly stream = new StackLayout();

  private readonly sections = new Map<string, FileSection>();
  private readonly testFile = new Map<string, string>();
  private readonly activeWorkers = new Set<number>();
  private summaryBlock: StackLayout | undefined;
  private startedAt: number | undefined;
  private finishedAt: number | undefined;
  private sessionError: string | undefined;
  private elapsedTimer: ReturnType<typeof setInterval> | undefined;
  private userPinned = false;
  private autoScrolling = false;
  private detachSource: (() => void) | undefined;

  constructor(options: VitestResultsViewOptions = {}) {
    super();
    this.rows = 'auto, *, auto';
    this.backgroundColor = COLORS.background;

    const headerBar = new GridLayout();
    headerBar.columns = 'auto, *';
    headerBar.backgroundColor = COLORS.bar;
    headerBar.padding = '8 12';

    const logo = new Image();
    try {
      logo.imageSource = ImageSource.fromBase64Sync(NATIVESCRIPT_LOGO_BASE64);
    } catch {
      // A failed logo decode must never take down the results UI.
    }
    logo.height = 18;
    logo.width = 18;
    logo.marginRight = 8;
    logo.verticalAlignment = 'middle';
    GridLayout.setColumn(logo, 0);
    headerBar.addChild(logo);

    this.headerLabel.text = 'Vitest  ·  waiting for runner…';
    this.headerLabel.fontFamily = MONO;
    this.headerLabel.fontSize = 13;
    this.headerLabel.fontWeight = '700';
    this.headerLabel.color = COLORS.dim;
    this.headerLabel.verticalAlignment = 'middle';
    this.headerLabel.textWrap = false;
    GridLayout.setColumn(this.headerLabel, 1);
    headerBar.addChild(this.headerLabel);

    GridLayout.setRow(headerBar, 0);
    this.addChild(headerBar);

    this.stream.padding = '8 12 16 12';
    this.scroll.content = this.stream;
    this.scroll.backgroundColor = COLORS.background;
    this.scroll.on(ScrollView.scrollEvent, (args: any) => {
      if (this.autoScrolling) return;
      const distanceFromBottom =
        this.scroll.scrollableHeight - (args.scrollY ?? 0);
      this.userPinned = distanceFromBottom > 60;
    });
    GridLayout.setRow(this.scroll, 1);
    this.addChild(this.scroll);

    this.countsLabel.text = '';
    this.countsLabel.fontFamily = MONO;
    this.countsLabel.textWrap = true;
    this.countsLabel.fontSize = 12;
    this.countsLabel.color = COLORS.dim;
    this.countsLabel.backgroundColor = COLORS.bar;
    this.countsLabel.padding = '8 12';
    GridLayout.setRow(this.countsLabel, 2);
    this.addChild(this.countsLabel);

    this.on(View.unloadedEvent, () => this.stopElapsedTimer());
    if (options.source) this.connect(options.source);
  }

  connect(source: NativeScriptTestEventSource): void {
    this.detachSource?.();
    this.detachSource = source.subscribe((event) => {
      switch (event.type) {
        case 'worker-run-started':
          this.onRunStarted(event.worker, event.files, event.timestamp);
          return;
        case 'tests-collected':
          event.tests.forEach((test) => this.upsertTest(test));
          this.afterStreamChange();
          return;
        case 'test-updated':
          this.upsertTest(event.test);
          this.afterStreamChange();
          return;
        case 'worker-run-finished':
          this.onRunFinished(event.worker, event.timestamp);
          return;
        case 'worker-error':
          this.onSessionError(event.message);
          return;
      }
    });
  }

  disconnect(): void {
    this.detachSource?.();
    this.detachSource = undefined;
  }

  dispose(): void {
    this.disconnect();
    this.stopElapsedTimer();
  }

  /**
   * Vitest dispatches each spec file as its own run request, so a session is
   * a sequence of run-started/run-finished pairs — accumulate across them
   * rather than treating every pair as a fresh session.
   */
  private onRunStarted(
    worker: number,
    files: string[],
    timestamp: number,
  ): void {
    this.finishedAt = undefined;
    this.startedAt ??= timestamp;
    this.activeWorkers.add(worker);
    files.forEach((file) => this.ensureSection(file));
    this.startElapsedTimer();
    this.renderHeader();
    this.renderCounts();
    this.afterStreamChange();
  }

  private onRunFinished(worker: number, timestamp: number): void {
    this.activeWorkers.delete(worker);
    if (this.activeWorkers.size > 0) return;
    this.finishedAt = timestamp;
    this.stopElapsedTimer();
    this.sections.forEach((section) => this.renderSectionHeader(section));
    this.appendSummary();
    this.renderHeader();
    this.renderCounts();
    this.afterStreamChange();
  }

  private onSessionError(message: string): void {
    // A transport error after the run completed is teardown noise (the host
    // closing the bridge), not a test failure — keep the verdict intact.
    const runFinished = this.finishedAt !== undefined;
    if (!runFinished) this.sessionError = message;

    const banner = new Label();
    banner.text = runFinished ? `ℹ ${message}` : `⚠ ${message}`;
    banner.fontFamily = MONO;
    banner.fontSize = runFinished ? 11 : 12;
    banner.color = runFinished ? COLORS.dim : COLORS.fail;
    banner.backgroundColor = runFinished ? COLORS.bar : COLORS.errorBg;
    banner.padding = '8 10';
    banner.marginTop = 8;
    banner.borderRadius = 6;
    banner.textWrap = true;
    this.stream.addChild(banner);
    this.renderHeader();
    this.afterStreamChange();
  }

  private ensureSection(filepath: string): FileSection {
    let section = this.sections.get(filepath);
    if (section) return section;

    const container = new StackLayout();
    container.marginTop = 10;

    const header = new Label();
    header.fontFamily = MONO;
    header.fontSize = 13;
    header.fontWeight = '700';
    header.color = COLORS.text;
    header.textWrap = true;
    container.addChild(header);

    section = { path: filepath, header, container, rows: new Map() };
    this.sections.set(filepath, section);
    this.renderSectionHeader(section);

    // Keep the summary the last child while sections stream in.
    if (this.summaryBlock) {
      const summaryIndex = this.stream.getChildIndex(this.summaryBlock);
      this.stream.insertChild(container, summaryIndex);
    } else {
      this.stream.addChild(container);
    }
    return section;
  }

  private upsertTest(descriptor: NativeScriptTestDescriptor): void {
    const section = this.ensureSection(descriptor.file);
    this.testFile.set(descriptor.id, descriptor.file);
    let row = section.rows.get(descriptor.id);

    // A late collection event must never downgrade a settled verdict back to
    // queued/running.
    const terminalStates: NativeScriptTestState[] = [
      'passed',
      'failed',
      'skipped',
      'todo',
    ];
    if (
      row &&
      terminalStates.includes(row.descriptor.state) &&
      (descriptor.state === 'queued' || descriptor.state === 'running')
    ) {
      return;
    }

    if (!row) {
      const container = new StackLayout();
      const line = new Label();
      line.fontFamily = MONO;
      line.fontSize = 12;
      line.textWrap = true;
      line.marginTop = 3;
      container.addChild(line);
      section.container.addChild(container);
      row = { descriptor, line, container };
      section.rows.set(descriptor.id, row);
    }

    row.descriptor = descriptor;
    const duration =
      descriptor.duration === undefined
        ? ''
        : ` ${formatDuration(descriptor.duration)}`;
    row.line.text = `  ${stateGlyph(descriptor.state)} ${displayName(descriptor)}${duration}`;
    row.line.color = stateColor(descriptor.state);

    if (descriptor.state === 'failed' && descriptor.error) {
      if (!row.errorLabel) {
        row.errorLabel = new Label();
        row.errorLabel.fontFamily = MONO;
        row.errorLabel.fontSize = 11;
        row.errorLabel.color = COLORS.fail;
        row.errorLabel.backgroundColor = COLORS.errorBg;
        row.errorLabel.padding = '6 8';
        row.errorLabel.margin = '2 0 4 16';
        row.errorLabel.borderRadius = 4;
        row.errorLabel.textWrap = true;
        row.container.addChild(row.errorLabel);
      }
      row.errorLabel.text = descriptor.error;
    } else if (row.errorLabel) {
      row.container.removeChild(row.errorLabel);
      row.errorLabel = undefined;
    }

    this.renderSectionHeader(section);
    this.renderHeader();
    this.renderCounts();
  }

  private sectionStats(section: FileSection): {
    total: number;
    failed: number;
    done: boolean;
    duration: number;
  } {
    let failed = 0;
    let done = section.rows.size > 0;
    let duration = 0;
    section.rows.forEach(({ descriptor }) => {
      if (descriptor.state === 'failed') failed += 1;
      if (descriptor.state === 'queued' || descriptor.state === 'running') {
        done = false;
      }
      duration += descriptor.duration ?? 0;
    });
    return { total: section.rows.size, failed, done, duration };
  }

  private renderSectionHeader(section: FileSection): void {
    const stats = this.sectionStats(section);
    const testCount =
      stats.total > 0
        ? ` (${stats.total} test${stats.total === 1 ? '' : 's'})`
        : '';
    const timing =
      stats.done && stats.total > 0
        ? ` ${formatDuration(stats.duration)}`
        : '';
    section.header.text = `❯ ${shortFilePath(section.path)}${testCount}${timing}`;
    section.header.color = stats.done
      ? stats.failed > 0
        ? COLORS.fail
        : COLORS.pass
      : COLORS.text;
  }

  private globalCounts(): {
    files: { total: number; failed: number; done: number };
    tests: Record<'passed' | 'failed' | 'skipped' | 'todo' | 'pending', number>;
  } {
    const files = { total: this.sections.size, failed: 0, done: 0 };
    const tests = { passed: 0, failed: 0, skipped: 0, todo: 0, pending: 0 };
    this.sections.forEach((section) => {
      const stats = this.sectionStats(section);
      if (stats.done) files.done += 1;
      if (stats.failed > 0) files.failed += 1;
      section.rows.forEach(({ descriptor }) => {
        switch (descriptor.state) {
          case 'passed':
            tests.passed += 1;
            break;
          case 'failed':
            tests.failed += 1;
            break;
          case 'skipped':
            tests.skipped += 1;
            break;
          case 'todo':
            tests.todo += 1;
            break;
          default:
            tests.pending += 1;
        }
      });
    });
    return { files, tests };
  }

  private renderHeader(): void {
    const brand = 'Vitest';
    if (this.sessionError) {
      this.headerLabel.text = `${brand}  ·  error`;
      this.headerLabel.color = COLORS.fail;
      return;
    }
    if (this.startedAt === undefined) {
      this.headerLabel.text = `${brand}  ·  waiting for runner…`;
      this.headerLabel.color = COLORS.dim;
      return;
    }
    if (this.finishedAt === undefined) {
      const elapsed = formatDuration(Date.now() - this.startedAt);
      this.headerLabel.text = `${brand}  ·  running… ${elapsed}`;
      this.headerLabel.color = COLORS.running;
      return;
    }
    const { tests } = this.globalCounts();
    const failed = tests.failed > 0 || this.sessionError;
    this.headerLabel.text = failed
      ? `${brand}  ·  ${tests.failed} failed`
      : `${brand}  ·  all tests passed`;
    this.headerLabel.color = failed ? COLORS.fail : COLORS.pass;
  }

  private renderCounts(): void {
    const { tests } = this.globalCounts();
    const parts = [
      `${tests.passed} passed`,
      `${tests.failed} failed`,
    ];
    if (tests.skipped > 0) parts.push(`${tests.skipped} skipped`);
    if (tests.todo > 0) parts.push(`${tests.todo} todo`);
    if (tests.pending > 0) parts.push(`${tests.pending} pending`);
    this.countsLabel.text = ` ${parts.join(' · ')}`;
    this.countsLabel.color =
      tests.failed > 0
        ? COLORS.fail
        : tests.pending > 0
          ? COLORS.dim
          : COLORS.pass;
  }

  private appendSummary(): void {
    if (this.summaryBlock) this.stream.removeChild(this.summaryBlock);

    const { files, tests } = this.globalCounts();
    const block = new StackLayout();
    block.marginTop = 14;
    block.padding = '10 12';
    block.backgroundColor = COLORS.bar;
    block.borderRadius = 8;

    const addLine = (
      title: string,
      value: string,
      valueColor: Color,
    ): void => {
      const line = new Label();
      line.fontFamily = MONO;
      line.fontSize = 12;
      line.textWrap = true;
      const formatted = title.padStart(10, ' ');
      line.text = `${formatted}  ${value}`;
      line.color = valueColor;
      block.addChild(line);
    };

    const fileParts: string[] = [];
    if (files.failed > 0) fileParts.push(`${files.failed} failed`);
    const filesPassed = files.total - files.failed;
    if (filesPassed > 0) fileParts.push(`${filesPassed} passed`);
    addLine(
      'Test Files',
      `${fileParts.join(' | ')} (${files.total})`,
      files.failed > 0 ? COLORS.fail : COLORS.pass,
    );

    const testParts: string[] = [];
    if (tests.failed > 0) testParts.push(`${tests.failed} failed`);
    if (tests.passed > 0) testParts.push(`${tests.passed} passed`);
    if (tests.skipped > 0) testParts.push(`${tests.skipped} skipped`);
    if (tests.todo > 0) testParts.push(`${tests.todo} todo`);
    const totalTests =
      tests.passed + tests.failed + tests.skipped + tests.todo + tests.pending;
    addLine(
      'Tests',
      `${testParts.join(' | ')} (${totalTests})`,
      tests.failed > 0 ? COLORS.fail : COLORS.pass,
    );

    if (this.startedAt !== undefined) {
      addLine('Start at', formatClock(this.startedAt), COLORS.text);
      addLine(
        'Duration',
        formatDuration((this.finishedAt ?? Date.now()) - this.startedAt),
        COLORS.text,
      );
    }

    this.summaryBlock = block;
    this.stream.addChild(block);
  }

  private startElapsedTimer(): void {
    if (this.elapsedTimer !== undefined) return;
    this.elapsedTimer = setInterval(() => this.renderHeader(), 500);
  }

  private stopElapsedTimer(): void {
    if (this.elapsedTimer !== undefined) clearInterval(this.elapsedTimer);
    this.elapsedTimer = undefined;
  }

  private afterStreamChange(): void {
    if (this.userPinned) return;
    const scrollToEnd = (): void => {
      if (this.userPinned) return;
      this.autoScrolling = true;
      this.scroll.scrollToVerticalOffset(
        Math.max(0, this.scroll.scrollableHeight),
        false,
      );
      setTimeout(() => {
        this.autoScrolling = false;
      }, 50);
    };
    setTimeout(scrollToEnd, 0);
    // scrollableHeight lags the content until the next layout pass (visible
    // on Android as an undershoot), so scroll again once layout settles.
    this.stream.once(View.layoutChangedEvent, () =>
      setTimeout(scrollToEnd, 0),
    );
  }
}

export function createVitestResultsPage(
  source: NativeScriptTestEventSource,
): Page {
  const page = new Page();
  page.actionBarHidden = true;
  page.backgroundColor = COLORS.background;
  page.content = new VitestResultsView({ source });
  return page;
}
