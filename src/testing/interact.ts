import { GestureTypes, View } from '@nativescript/core';
import { nextRenderPass } from './wait.js';

/**
 * NativeScript routes `on('tap')` through two mutually exclusive paths:
 * classes declaring a static `<name>Event` property (Button and friends)
 * store plain listeners reachable via `notify`, while every other view wraps
 * the callback in a native gesture observer that `notify` never reaches.
 * Dispatching through both paths covers either kind without double-firing.
 */
function dispatchGesture(view: View, name: string, type: GestureTypes): void {
  const eventData = {
    eventName: name,
    object: view,
    view,
    type,
    ios: undefined,
    android: undefined,
  };

  const observers = view.getGestureObservers(type);
  observers?.forEach((observer) => {
    const callback = observer.callback as
      | ((data: unknown) => void)
      | undefined;
    callback?.call(observer.context, eventData);
  });

  view.notify(eventData);
}

export async function tap(view: View): Promise<void> {
  dispatchGesture(view, 'tap', GestureTypes.tap);
  await nextRenderPass();
}

export async function doubleTap(view: View): Promise<void> {
  dispatchGesture(view, 'doubleTap', GestureTypes.doubleTap);
  await nextRenderPass();
}

export async function longPress(view: View): Promise<void> {
  dispatchGesture(view, 'longPress', GestureTypes.longPress);
  await nextRenderPass();
}

interface TextInputView extends View {
  text: string;
}

/**
 * Simulates user text entry: programmatic `text` assignment alone does not
 * fire `textChange` in NativeScript (mirroring native behavior), so the
 * event is dispatched explicitly.
 */
export async function enterText(
  view: TextInputView,
  text: string,
): Promise<void> {
  const oldValue = view.text;
  view.text = text;
  view.notify({
    eventName: 'textChange',
    object: view,
    propertyName: 'text',
    value: text,
    oldValue,
  });
  await nextRenderPass();
}

export async function returnPress(view: View): Promise<void> {
  view.notify({ eventName: 'returnPress', object: view });
  await nextRenderPass();
}
