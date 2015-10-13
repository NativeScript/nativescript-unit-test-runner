interface String {
    startsWith(prefix: string): boolean;
}

declare var global;
declare var require;


declare module module {
    var id: string;
    var filename: string;
    var exports: any;
}
// Same as module.exports
declare var exports: any;

declare function exit(exitCode: number): void;

declare module java {
    module lang {
        module System {
            function exit(exitCode: number): void;
        }
    }
}

/**
 * Contains the Observable class, which represents an observable object, or "data" in the model-view paradigm.
 */
declare module "data/observable" {
    /**
     * Base event data.
     */
    interface EventData {
        /**
         * The name of the event.
         */
        eventName: string;
        /**
         * The Observable instance that has raised the event.
         */
        object: Observable;
    }

    /**
     * Data for the "propertyChange" event.
     */
    interface PropertyChangeData extends EventData {
        /**
         * The name of the property that has changed.
         */
        propertyName: string;
        /**
         * The new value of the property.
         */
        value: any;
    }

    /**
     * Observable is used when you want to be notified when a change occurs. Use on/off methods to add/remove listener.
     */
    class Observable {
        /**
         * String value used when hooking to propertyChange event.
         */
        public static propertyChangeEvent: string;

        /**
         * Creates an Observable instance and sets its properties accroding to the supplied JSON object.
         */
        constructor(json?: any);

        /**
         * Gets the name of the constructor function for this instance. E.g. for a Button class this will return "Button".
         */
        typeName: string;

        /**
         * A basic method signature to hook an event listener (shortcut alias to the addEventListener method).
         * @param eventNames - String corresponding to events (e.g. "propertyChange"). Optionally could be used more events separated by `,` (e.g. "propertyChange", "change").
         * @param callback - Callback function which will be executed when event is raised.
         * @param thisArg - An optional parameter which will be used as `this` context for callback execution.
         */
        on(eventNames: string, callback: (data: EventData) => void, thisArg?: any);

        /**
         * Raised when a propertyChange occurs.
         */
        on(event: "propertyChange", callback: (data: EventData) => void, thisArg?: any);

        /**
         * Shortcut alias to the removeEventListener method.
         */
        off(eventNames: string, callback?: any, thisArg?: any);

        /**
         * Adds a listener for the specified event name.
         * @param eventNames Comma delimited names of the events to attach the listener to.
         * @param callback A function to be called when some of the specified event(s) is raised.
         * @param thisArg An optional parameter which when set will be used as "this" in callback method call.
         */
        addEventListener(eventNames: string, callback: (data: EventData) => void, thisArg?: any);

        /**
         * Removes listener(s) for the specified event name.
         * @param eventNames Comma delimited names of the events the specified listener is associated with.
         * @param callback An optional parameter pointing to a specific listener. If not defined, all listeners for the event names will be removed.
         * @param thisArg An optional parameter which when set will be used to refine search of the correct callback which will be removed as event listener.
         */
        removeEventListener(eventNames: string, callback?: any, thisArg?: any);

        /**
         * Updates the specified property with the provided value.
         */
        set(name: string, value: any): void;

        /**
         * Gets the value of the specified property.
         */
        get(name: string): any;

        /**
         * Notifies all the registered listeners for the event provided in the data.eventName.
         * @param data The data associated with the event.
         */
        notify<T extends EventData>(data: T): void;

        /**
         * Notifies all the registered listeners for the property change event.
         */
        notifyPropertyChange(propertyName: string, newValue: any): void;

        /**
         * Checks whether a listener is registered for the specified event name.
         * @param eventName The name of the event to check for.
         */
        hasListeners(eventName: string): boolean;

        //@private
        /**
         * This method is intended to be overriden by inheritors to provide additional implementation.
         */
        _setCore(data: PropertyChangeData);
        _createPropertyChangeData(name: string, value: any): PropertyChangeData;
        _emit(eventNames: string);
        //@endprivate
    }
}

declare module "data/observable-array" {
    import observable = require("data/observable");

    /**
     * Event args for "changed" event.
     */
    interface ChangedData<T> extends observable.EventData {
        /**
         * Change type.
         */
        action: string;

        /**
         * Start index.
         */
        index: number;

        /**
         * Removed items.
         */
        removed: Array<T>;

        /**
         * Number of added items.
         */
        addedCount: number;
    }

    /**
     * Change types.
     */
    class ChangeType {
        static Add: string;
        static Delete: string;
        static Update: string;
        static Splice: string;
    }

    /**
     * Advanced array like class used when you want to be notified when a change occurs.
     */
    class ObservableArray<T> extends observable.Observable {
        /**
         * String value used when hooking to change event.
         */
        public static changeEvent: string;

        /**
         * A basic method signature to hook an event listener (shortcut alias to the addEventListener method).
         * @param eventNames - String corresponding to events (e.g. "propertyChange"). Optionally could be used more events separated by `,` (e.g. "propertyChange", "change").
         * @param callback - Callback function which will be executed when event is raised.
         * @param thisArg - An optional parameter which will be used as `this` context for callback execution.
         */
        on(eventNames: string, callback: (data: observable.EventData) => void, thisArg?: any);

        /**
         * Raised when a change occurs.
         */
        on(event: "change", callback: (args: ChangedData<T>) => void, thisArg?: any);

        /**
         * Create ObservableArray<T> with specified length.
         */
        constructor(arrayLength?: number);

        /**
         * Create ObservableArray<T> from source Array<T>.
         */
        constructor(items: T[]);

        /**
         * Create ObservableArray<T> from T items.
         */
        constructor(...items: T[]);

        /**
         * Returns item at specified index.
         */
        getItem(index: number): T;
        /**
         * Sets item at specified index.
         */
        setItem(index: number, value: T): void;
        /**
         * Returns a string representation of an array.
         */
        toString(): string;
        toLocaleString(): string;
        /**
         * Combines two or more arrays.
         * @param items Additional items to add to the end of array1.
         */
        concat<U extends T[]>(...items: U[]): T[];
        /**
         * Combines two or more arrays.
         * @param items Additional items to add to the end of array1.
         */
        concat(...items: T[]): T[];
        /**
         * Adds all the elements of an array separated by the specified separator string.
         * @param separator A string used to separate one element of an array from the next in the resulting String. If omitted, the array elements are separated with a comma.
         */
        join(separator?: string): string;
        /**
         * Removes the last element from an array and returns it.
         */
        pop(): T;
        /**
         * Appends new elements to an array, and returns the new length of the array.
         * @param items New elements of the Array.
         */
        push(items: T[]): number;
        /**
         * Appends new elements to an array, and returns the new length of the array.
         * @param items New elements of the Array.
         */
        push(...items: T[]): number;

        /**
         * Reverses the elements in an Array.
         */
        reverse(): T[];
        /**
         * Removes the first element from an array and returns it.
         */
        shift(): T;
        /**
         * Returns a section of an array.
         * @param start The beginning of the specified portion of the array.
         * @param end The end of the specified portion of the array.
         */
        slice(start?: number, end?: number): T[];

        /**
         * Sorts an array.
         * @param compareFn The name of the function used to determine the order of the elements. If omitted, the elements are sorted in ascending, ASCII character order.
         */
        sort(compareFn?: (a: T, b: T) => number): T[];

        /**
         * Removes elements from an array and, if necessary, inserts new elements in their place, returning the deleted elements.
         * @param start The zero-based location in the array from which to start removing elements.
         */
        splice(start: number): T[];

        /**
         * Removes elements from an array and, if necessary, inserts new elements in their place, returning the deleted elements.
         * @param start The zero-based location in the array from which to start removing elements.
         * @param deleteCount The number of elements to remove.
         * @param items Elements to insert into the array in place of the deleted elements.
         */
        splice(start: number, deleteCount: number, ...items: T[]): T[];

        /**
         * Inserts new elements at the start of an array.
         * @param items  Elements to insert at the start of the Array.
         */
        unshift(...items: T[]): number;

        /**
         * Returns the index of the first occurrence of a value in an array.
         * @param searchElement The value to locate in the array.
         * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the search starts at index 0.
         */
        indexOf(searchElement: T, fromIndex?: number): number;

        /**
         * Returns the index of the last occurrence of a specified value in an array.
         * @param searchElement The value to locate in the array.
         * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the search starts at the last index in the array.
         */
        lastIndexOf(searchElement: T, fromIndex?: number): number;

        /**
         * Determines whether all the members of an array satisfy the specified test.
         * @param callbackfn A function that accepts up to three arguments. The every method calls the callbackfn function for each element in array1 until the callbackfn returns false, or until the end of the array.
         * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
         */
        every(callbackfn: (value: T, index: number, array: T[]) => boolean, thisArg?: any): boolean;

        /**
         * Determines whether the specified callback function returns true for any element of an array.
         * @param callbackfn A function that accepts up to three arguments. The some method calls the callbackfn function for each element in array1 until the callbackfn returns true, or until the end of the array.
         * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
         */
        some(callbackfn: (value: T, index: number, array: T[]) => boolean, thisArg?: any): boolean;

        /**
         * Performs the specified action for each element in an array.
         * @param callbackfn  A function that accepts up to three arguments. forEach calls the callbackfn function one time for each element in the array.
         * @param thisArg  An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
         */
        forEach(callbackfn: (value: T, index: number, array: T[]) => void, thisArg?: any): void;

        /**
         * Calls a defined callback function on each element of an array, and returns an array that contains the results.
         * @param callbackfn A function that accepts up to three arguments. The map method calls the callbackfn function one time for each element in the array.
         * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
         */
        map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[];

        /**
         * Returns the elements of an array that meet the condition specified in a callback function.
         * @param callbackfn A function that accepts up to three arguments. The filter method calls the callbackfn function one time for each element in the array.
         * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
         */
        filter(callbackfn: (value: T, index: number, array: T[]) => boolean, thisArg?: any): T[];

        /**
         * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
         * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.
         * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
         */
        reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue?: T): T;
        /**
         * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
         * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.
         * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
         */
        reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;

        /**
         * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
         * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls the callbackfn function one time for each element in the array.
         * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
         */
        reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue?: T): T;
        /**
         * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
         * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls the callbackfn function one time for each element in the array.
         * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
         */
        reduceRight<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;

        /**
         * Gets or sets the length of the array. This is a number one higher than the highest element defined in an array.
         */
        length: number;
    }
}

// Type definitions for es6-promise
// Project: https://github.com/jakearchibald/ES6-Promise
// Definitions by: François de Campredon <https://github.com/fdecampredon/>
// Definitions: https://github.com/borisyankov/DefinitelyTyped
interface Thenable<R> {
    then<U>(onFulfilled?: (value: R) => Thenable<U>, onRejected?: (error: any) => Thenable<U>): Thenable<U>;
    then<U>(onFulfilled?: (value: R) => Thenable<U>, onRejected?: (error: any) => U): Thenable<U>;
    then<U>(onFulfilled?: (value: R) => Thenable<U>, onRejected?: (error: any) => void): Thenable<U>;
    then<U>(onFulfilled?: (value: R) => U, onRejected?: (error: any) => Thenable<U>): Thenable<U>;
    then<U>(onFulfilled?: (value: R) => U, onRejected?: (error: any) => U): Thenable<U>;
    then<U>(onFulfilled?: (value: R) => U, onRejected?: (error: any) => void): Thenable<U>;
}

declare class Promise<R> implements Thenable<R> {
    /**
     * If you call resolve in the body of the callback passed to the constructor,
     * your promise is fulfilled with result object passed to resolve.
     * If you call reject your promise is rejected with the object passed to resolve.
     * For consistency and debugging (eg stack traces), obj should be an instanceof Error.
     * Any errors thrown in the constructor callback will be implicitly passed to reject().
     */
    constructor(callback: (resolve: (result?: R) => void, reject: (error: any) => void) => void);
    /**
     * If you call resolve in the body of the callback passed to the constructor,
     * your promise will be fulfilled/rejected with the outcome of thenable passed to resolve.
     * If you call reject your promise is rejected with the object passed to resolve.
     * For consistency and debugging (eg stack traces), obj should be an instanceof Error.
     * Any errors thrown in the constructor callback will be implicitly passed to reject().
     */
    constructor(callback: (resolve: (thenable?: Thenable<R>) => void, reject: (error: any) => void) => void);

    /**
     * onFulfilled is called when/if "promise" resolves. onRejected is called when/if "promise" rejects.
     * Both are optional, if either/both are omitted the next onFulfilled/onRejected in the chain is called.
     * Both callbacks have a single parameter , the fulfillment value or rejection reason.
     * "then" returns a new promise equivalent to the value you return from onFulfilled/onRejected after being passed through Promise.resolve.
     * If an error is thrown in the callback, the returned promise rejects with that error.
     * @param onFulfilled called when/if "promise" resolves
     * @param onRejected called when/if "promise" rejects
     */
    then<U>(onFulfilled?: (value: R) => Thenable<U>, onRejected?: (error: any) => Thenable<U>): Promise<U>;
    /**
     * onFulfilled is called when/if "promise" resolves. onRejected is called when/if "promise" rejects.
     * Both are optional, if either/both are omitted the next onFulfilled/onRejected in the chain is called.
     * Both callbacks have a single parameter , the fulfillment value or rejection reason.
     * "then" returns a new promise equivalent to the value you return from onFulfilled/onRejected after being passed through Promise.resolve.
     * If an error is thrown in the callback, the returned promise rejects with that error.
     * @param onFulfilled called when/if "promise" resolves
     * @param onRejected called when/if "promise" rejects
     */
    then<U>(onFulfilled?: (value: R) => Thenable<U>, onRejected?: (error: any) => U): Promise<U>;
    /**
     * onFulfilled is called when/if "promise" resolves. onRejected is called when/if "promise" rejects.
     * Both are optional, if either/both are omitted the next onFulfilled/onRejected in the chain is called.
     * Both callbacks have a single parameter , the fulfillment value or rejection reason.
     * "then" returns a new promise equivalent to the value you return from onFulfilled/onRejected after being passed through Promise.resolve.
     * If an error is thrown in the callback, the returned promise rejects with that error.
     * @param onFulfilled called when/if "promise" resolves
     * @param onRejected called when/if "promise" rejects
     */
    then<U>(onFulfilled?: (value: R) => Thenable<U>, onRejected?: (error: any) => void): Promise<U>;
    /**
     * onFulfilled is called when/if "promise" resolves. onRejected is called when/if "promise" rejects.
     * Both are optional, if either/both are omitted the next onFulfilled/onRejected in the chain is called.
     * Both callbacks have a single parameter , the fulfillment value or rejection reason.
     * "then" returns a new promise equivalent to the value you return from onFulfilled/onRejected after being passed through Promise.resolve.
     * If an error is thrown in the callback, the returned promise rejects with that error.
     * @param onFulfilled called when/if "promise" resolves
     * @param onRejected called when/if "promise" rejects
     */
    then<U>(onFulfilled?: (value: R) => U, onRejected?: (error: any) => Thenable<U>): Promise<U>;
    /**
     * onFulfilled is called when/if "promise" resolves. onRejected is called when/if "promise" rejects.
     * Both are optional, if either/both are omitted the next onFulfilled/onRejected in the chain is called.
     * Both callbacks have a single parameter , the fulfillment value or rejection reason.
     * "then" returns a new promise equivalent to the value you return from onFulfilled/onRejected after being passed through Promise.resolve.
     * If an error is thrown in the callback, the returned promise rejects with that error.
     * @param onFulfilled called when/if "promise" resolves
     * @param onRejected called when/if "promise" rejects
     */
    then<U>(onFulfilled?: (value: R) => U, onRejected?: (error: any) => U): Promise<U>;
    /**
     * onFulfilled is called when/if "promise" resolves. onRejected is called when/if "promise" rejects.
     * Both are optional, if either/both are omitted the next onFulfilled/onRejected in the chain is called.
     * Both callbacks have a single parameter , the fulfillment value or rejection reason.
     * "then" returns a new promise equivalent to the value you return from onFulfilled/onRejected after being passed through Promise.resolve.
     * If an error is thrown in the callback, the returned promise rejects with that error.
     * @param onFulfilled called when/if "promise" resolves
     * @param onRejected called when/if "promise" rejects
     */
    then<U>(onFulfilled?: (value: R) => U, onRejected?: (error: any) => void): Promise<U>;

    /**
     * Sugar for promise.then(undefined, onRejected)
     * @param onRejected called when/if "promise" rejects
     */
    catch<U>(onRejected?: (error: any) => Thenable<U>): Promise<U>;
    /**
     * Sugar for promise.then(undefined, onRejected)
     * @param onRejected called when/if "promise" rejects
     */
    catch<U>(onRejected?: (error: any) => U): Promise<U>;
    /**
     * Sugar for promise.then(undefined, onRejected)
     * @param onRejected called when/if "promise" rejects
     */
    catch<U>(onRejected?: (error: any) => void): Promise<U>;
}

declare module Promise {
    /**
     * Returns promise (only if promise.constructor == Promise)
     */
    function cast<R>(promise: Promise<R>): Promise<R>;
    /**
     * Make a promise that fulfills to obj.
     */
    function cast<R>(object: R): Promise<R>;

    /**
     * Make a new promise from the thenable.
     * A thenable is promise-like in as far as it has a "then" method.
     * This also creates a new promise if you pass it a genuine JavaScript promise, making it less efficient for casting than Promise.cast.
     */
    function resolve<R>(thenable?: Thenable<R>): Promise<R>;
    /**
     * Make a promise that fulfills to obj. Same as Promise.cast(obj) in this situation.
     */
    function resolve<R>(object?: R): Promise<R>;

    /**
     * Make a promise that rejects to obj. For consistency and debugging (eg stack traces), obj should be an instanceof Error
     */
    function reject(error: any): Promise<any>;

    /**
     * Make a promise that fulfills when every item in the array fulfills, and rejects if (and when) any item rejects.
     * the array passed to all can be a mixture of promise-like objects and other objects.
     * The fulfillment value is an array (in order) of fulfillment values. The rejection value is the first rejection value.
     */
    function all<R>(promises: Promise<R>[]): Promise<R[]>;

    /**
     * Make a Promise that fulfills when any item fulfills, and rejects if any item rejects.
     */
    function race<R>(promises: Promise<R>[]): Promise<R>;
}

/**
 * Allows you to send web requests and receive the responses.
 */
declare module "http" {
   /**
    * Downloads the content from the specified URL as a string.
    * @param url The URL to request from.
    */
    export function getString(url: string): Promise<string>

   /**
    * Downloads the content from the specified URL as a string.
    * @param options An object that specifies various request options.
    */
    export function getString(options: HttpRequestOptions): Promise<string>

   /**
    * Downloads the content from the specified URL as a string and returns its JSON.parse representation.
    * @param url The URL to request from.
    */
    export function getJSON<T>(url: string): Promise<T>

   /**
    * Downloads the content from the specified URL as a string and returns its JSON.parse representation.
    * @param options An object that specifies various request options.
    */
    export function getJSON<T>(options: HttpRequestOptions): Promise<T>

   /**
    * Makes a generic http request using the provided options and returns a HttpResponse Object.
    * @param options An object that specifies various request options.
    */
    export function request(options: HttpRequestOptions): Promise<HttpResponse>;

   /**
    * Provides options for the http requests.
    */
    export interface HttpRequestOptions {
         /**
          * Gets or sets the request url.
          */
        url: string;

         /**
          * Gets or sets the request method.
          */
        method: string;

         /**
          * Gets or sets the request headers in JSON format.
          */
        headers?: any;

         /**
          * Gets or sets the request body.
          */
        content?: string | FormData;

         /**
          * Gets or sets the request timeout in milliseconds.
          */
        timeout?: number;
    }

   /**
    * Encapsulates HTTP-response information from an HTTP-request.
    */
    export interface HttpResponse {
       /**
        * Gets the response status code.
        */
        statusCode: number;

       /**
        * Gets the response headers.
        */
        headers: any;

       /**
        * Gets the response content.
        */
        content?: HttpContent;
    }

   /**
    * Encapsulates the content of an HttpResponse.
    */
    export interface HttpContent {
       /**
        * Gets the response body as raw data.
        */
        raw: any;

       /**
        * Gets the response body as string.
        */
        toString: () => string;

       /**
        * Gets the response body as JSON object.
        */
        toJSON: () => any;
    }
}

/**
 * Contains all kinds of information about the device, its operating system and software.
 */
declare module "platform" {

    /*
     * Enum holding platform names.
     */
    export module platformNames {
        export var android: string;
        export var ios: string;
    }

    /*
     * An object containing device specific information.
     */
    export class device {
        /**
         * Gets the manufacturer of the device.
         * For example: "Apple" or "HTC" or "Samsung".
         */
        static manufacturer: string;

        /**
         * Gets the model of the device.
         * For example: "Nexus 5" or "iPhone".
         */
        static model: string;

        /**
         * Gets the model of the device.
         * For example: "Android" or "iOS".
         */
        static os: string;

        /**
         * Gets the OS version.
         * For example: 4.4.4(android), 8.1(ios)
         */
        static osVersion: string;

        /**
         * Gets the OS version.
         * For example: 19(android), 8.1(ios).
         */
        static sdkVersion: string;

        /**
         * Gets the type current device.
         * Available values: "phone", "tablet".
         */
        static deviceType: string;

        /**
         * Gets the uuid.
         * On iOS this will return a new uuid if the application re-installed on the device.
         * If you need to receive the same uuid even after the application has been re-installed on the device,
         * use this plugin: https://www.npmjs.com/package/nativescript-ios-uuid
         */
         static uuid: string;

        /**
         * Gets the preferred language. For example "en" or "en_US"
         */
        static language: string;
    }

    /**
     * An object containing screen information.
     */
    export interface ScreenMetrics {
        /**
         * Gets the absolute width of the screen in pixels.
         */
        widthPixels: number;

        /**
         * Gets the absolute height of the screen in pixels.
         */
        heightPixels: number;

        /**
         * Gets the absolute width of the screen in density independent pixels.
         */
        widthDIPs: number;

        /**
         * Gets the absolute height of the screen in density independent pixels.
         */
        heightDIPs: number;

        /**
         * The logical density of the display. This is a scaling factor for the Density Independent Pixel unit.
         */
        scale: number;
    }

    /**
     * An object describing general information about a display.
     */
    export class screen {
        /**
         * Gets information about the main screen of the current device.
         */
        static mainScreen: ScreenMetrics;
    }
}

/**
 * Contains the Frame class, which represents the logical View unit that is responsible for navigation within an application.
 */
declare module "ui/frame" {
    /**
     * Represents the logical View unit that is responsible for navigation withing an application.
     * Typically an application will have a Frame object at a root level.
     * Nested frames are supported, enabling hierarchical navigation scenarios.
     */
    export class Frame  {
        /**
         * Navigates to a Page instance as described by the module name.
         * This method will require the module and will check for a Page property in the exports of the module.
         * @param pageModuleName The name of the module to require starting from the application root.
         * For example if you want to navigate to page called "myPage.js" in a folder called "subFolder" and your root folder is "app" you can call navigate method like this:
         * var frames = require("ui/frame");
         * frames.topmost().navigate("app/subFolder/myPage");
         */
        navigate(pageModuleName: string);
    }

    /**
     * Gets the topmost frame in the frames stack. An application will typically has one frame instance. Multiple frames handle nested (hierarchical) navigation scenarios.
     */
    export function topmost(): Frame;
}

/**
 * Contains the application abstraction with all related methods.
 */
declare module "application" {
    import observable = require("data/observable");
    import frame = require("ui/frame");

    /**
     * An extended JavaScript Error which will have the nativeError property initialized in case the error is caused by executing platform-specific code.
     */
    export interface NativeScriptError extends Error {
        /**
         * Represents the native error object.
         */
        nativeError: any;
    }

    /**
     * String value used when hooking to launch event.
     */
    export var launchEvent: string;

    /**
     * String value used when hooking to uncaughtError event.
     */
    export var uncaughtErrorEvent: string;

    /**
     * String value used when hooking to suspend event.
     */
    export var suspendEvent: string;

    /**
     * String value used when hooking to resume event.
     */
    export var resumeEvent: string;

    /**
     * String value used when hooking to exitevent.
     */
    export var exitEvent: string;

    /**
     * String value used when hooking to lowMemory event.
     */
    export var lowMemoryEvent: string;

    /**
     * String value used when hooking to orientationChanged event.
     */
    export var orientationChangedEvent: string;

    /**
     * Event data containing information for the application events.
     */
    export interface ApplicationEventData {
        /**
         * Gets the native iOS event arguments. Valid only when running on iOS.
         */
        ios?: any;

        /**
         * Gets the native Android event arguments. Valid only when running on Android.
         */
        android?: any;

        /**
         * The name of the event.
         */
        eventName: string;

        /**
         * The instance that has raised the event.
         */
        object: any;
    }

    /**
     * Event data containing information for orientation changed event.
     */
    export interface OrientationChangedEventData extends ApplicationEventData {
        /**
         * New orientation value.
         */
        newValue: string;
    }

    /**
     * The main page path (without the file extension) for the application starting from the application root.
     * For example if you have page called "main.js" in a folder called "subFolder" and your root folder is "app" you can specify mainModule like this:
     * var application = require("application");
     * application.mainModule = "app/subFolder/main";
     * application.start();
     */
    export var mainModule: string;

    /**
     * The application level css file name (starting from the application root). Used to set css across all pages.
     * Css will be applied for every page and page css will be applied after.
     */
    export var cssFile: string;

    /**
     * Call this method to start the application. Important: All code after this method call will not be executed!
     */
    export function start();

    /**
     * A callback to be used when an uncaught error occurs while the application is running.
     * The application will be shut down after this method returns.
     * Loading new UI at this point is erroneous and may lead to unpredictable results.
     * The method is intended to be used for crash reports and/or application restart.
     */
    export function onUncaughtError(error: NativeScriptError): void;

    /**
     * This method will be called when the Application is suspended.
     */
    export function onSuspend();

    /**
     * This method will be called when the Application is resumed after it has been suspended.
     */
    export function onResume();

    /**
     * This method will be called when the Application is about to exitEvent.
     */
    export function onExit();

    /**
     * This method will be called when there is low memory on the target device.
     */
    export function onLowMemory();

    /**
     * A basic method signature to hook an event listener (shortcut alias to the addEventListener method).
     * @param eventNames - String corresponding to events (e.g. "onLaunch"). Optionally could be used more events separated by `,` (e.g. "onLaunch", "onSuspend").
     * @param callback - Callback function which will be executed when event is raised.
     * @param thisArg - An optional parameter which will be used as `this` context for callback execution.
     */
    export function on(eventNames: string, callback: (data: any) => void, thisArg?: any);

    /**
     * Shortcut alias to the removeEventListener method.
     * @param eventNames - String corresponding to events (e.g. "onLaunch").
     * @param callback - Callback function which will be removed.
     * @param thisArg - An optional parameter which will be used as `this` context for callback execution.
     */
    export function off(eventNames: string, callback ?: any, thisArg ?: any);

    /**
     * Notifies all the registered listeners for the event provided in the data.eventName.
     * @param data The data associated with the event.
     */
    export function notify(data: any): void;

    /**
     * Checks whether a listener is registered for the specified event name.
     * @param eventName The name of the event to check for.
     */
    export function hasListeners(eventName: string): boolean;

    /**
     * This event is raised on application launchEvent.
     */
    export function on(event: "launch", callback: (args: ApplicationEventData) => void, thisArg?: any);

    /**
     * This event is raised when the Application is suspended.
     */
    export function on(event: "suspend", callback: (args: ApplicationEventData) => void, thisArg?: any);

    /**
     * This event is raised when the Application is resumed after it has been suspended.
     */
    export function on(event: "resume", callback: (args: ApplicationEventData) => void, thisArg?: any);

    /**
     * This event is raised when the Application is about to exitEvent.
     */
    export function on(event: "exit", callback: (args: ApplicationEventData) => void, thisArg?: any);

    /**
     * This event is raised when there is low memory on the target device.
     */
    export function on(event: "lowMemory", callback: (args: ApplicationEventData) => void, thisArg?: any);

    /**
     * This event is raised when an uncaught error occurs while the application is running.
     */
    export function on(event: "uncaughtError", callback: (args: ApplicationEventData) => void, thisArg?: any);

    /**
     * This event is raised the orientation of the current device has changed.
     */
    export function on(event: "orientationChanged", callback: (args: OrientationChangedEventData) => void, thisArg?: any);

    /**
     * This is the Android-specific application object instance.
     * Encapsulates methods and properties specific to the Android platform.
     * Will be undefined when TargetOS is iOS.
     */
    export var android: any;

    /**
     * This is the iOS-specific application object instance.
     * Encapsulates methods and properties specific to the iOS platform.
     * Will be undefined when TargetOS is Android.
     */
    export var ios: any;

    /**
     * Data for the Android activity events.
     */
}
