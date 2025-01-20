import InternalEvents from './internalEvents';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyFunction = (...args: any[]) => void;
/* eslint-enable @typescript-eslint/no-explicit-any */

class BackgroundEventHandlers {
    callbacks: AnyFunction[] = [];

    registerCallback(callback: AnyFunction) {
        this.callbacks.push(callback);
    }
}
export class BackgroundEvents {
    static events: { [key: string]: BackgroundEventHandlers } = {};

    public static addEventListener<T extends keyof InternalEvents>(eventName: T, key: string, callback: (v: InternalEvents[T]) => void) {
        const id = `${eventName}-${key}`;
        if (!this.events[id]) {
            this.events[id] = new BackgroundEventHandlers();
        }
        this.events[id].registerCallback(callback);
    }

    public static dispatchEvent<T extends keyof InternalEvents>(eventName: T, key: string, event: InternalEvents[T]) {
        this.events[`${eventName}-${key}`]?.callbacks.forEach((callback) => {
            callback(event);
        });
    }

    public static removeEventListener<T extends keyof InternalEvents>(eventName: T, key: string) {
        delete this.events[`${eventName}-${key}`];
    }
}
