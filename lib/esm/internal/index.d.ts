import InternalEvents from "./internalEvents";
type AnyFunction = (...args: any[]) => void;
declare class BackgroundEventHandlers {
    callbacks: AnyFunction[];
    registerCallback(callback: AnyFunction): void;
}
export declare class BackgroundEvents {
    static events: {
        [key: string]: BackgroundEventHandlers;
    };
    static addEventListener<T extends keyof InternalEvents>(eventName: T, key: string, callback: (v: InternalEvents[T]) => void): void;
    static dispatchEvent<T extends keyof InternalEvents>(eventName: T, key: string, event: InternalEvents[T]): void;
    static removeEventListener<T extends keyof InternalEvents>(eventName: T, key: string): void;
}
export {};
