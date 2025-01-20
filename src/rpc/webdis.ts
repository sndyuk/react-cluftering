import { AnyClusterEventEgress } from '../internal/state';
import { Rpc } from './core';

export type WebdisRpcClientOptions = {
    ssl?: boolean;
    pingIntervalSec?: number;
};
export class WebdisRpcClient implements Rpc {
    socketsIngress: { [clusterId: string]: { socket: WebSocket; pingTimer?: NodeJS.Timer } } = {};
    socketsEgress: { [clusterId: string]: { socket: WebSocket; isSubscribed: boolean } } = {};

    callbacksEgress: { [clusterId: string]: ((event: AnyClusterEventEgress) => void)[] } = {};

    protected ssl: boolean;
    protected pingIntervalSec: number;
    constructor(protected host: string, protected port: number, options: WebdisRpcClientOptions = {}) {
        this.ssl = options.ssl !== false;
        this.pingIntervalSec = options.pingIntervalSec || 55;
    }

    connect(clusterId: string, nRetry = 1): Promise<unknown> {
        let promise1: Promise<void> | null = null;
        {
            const existingSocketIngress = this.socketsIngress[clusterId]?.socket;
            if (!existingSocketIngress || existingSocketIngress.readyState === WebSocket.CLOSING || existingSocketIngress.readyState === WebSocket.CLOSED) {
                if (existingSocketIngress) {
                    this.closeSocketIngress(clusterId);
                }
                this.socketsIngress[clusterId] = { socket: new WebSocket(`${this.ssl ? 'wss' : 'ws'}://${this.host}:${this.port}/.json?ingress=${clusterId}`) };
                promise1 = new Promise<void>((resolve, reject) => {
                    this.socketsIngress[clusterId].socket.onopen = () => {
                        resolve();
                    };
                    this.socketsIngress[clusterId].socket.onerror = (e) => {
                        this.socketsIngress[clusterId]?.socket.close(3000, e ? `${e}` : 'unknown error');
                        reject(e);
                    };
                    this.socketsIngress[clusterId].socket.onclose = (e) => {
                        if (e) {
                            console.warn(`Socket is unexpectedly closed. Reconnect will be attempted in ${1000 * nRetry} millis.`, e.reason);
                            setTimeout(() => {
                                this.connect(clusterId, nRetry + 1);
                            }, 1000 * nRetry);
                        }
                    };
                }).then(() => {
                    // ping
                    clearInterval(this.socketsIngress[clusterId].pingTimer);
                    const t = setInterval(() => {
                        const socket = this.socketsIngress[clusterId]?.socket;
                        if (!socket || socket.readyState !== WebSocket.OPEN) {
                            return;
                        }
                        socket.send(JSON.stringify(['publish', clusterId, 'tick']));
                    }, this.pingIntervalSec * 1000);
                    this.socketsIngress[clusterId].pingTimer = t;
                });
            }
        }

        let promise2: Promise<void> | null = null;
        {
            const existingSocketEgress = this.socketsEgress[clusterId]?.socket;

            if (!existingSocketEgress || existingSocketEgress.readyState === WebSocket.CLOSING || existingSocketEgress.readyState === WebSocket.CLOSED) {
                if (existingSocketEgress) {
                    this.closeSocketEgress(clusterId);
                }
                this.socketsEgress[clusterId] = { socket: new WebSocket(`${this.ssl ? 'wss' : 'ws'}://${this.host}:${this.port}/.json?egress=${clusterId}`), isSubscribed: false };
                promise2 = new Promise<void>((resolve, reject) => {
                    this.socketsEgress[clusterId].socket.onopen = () => {
                        if (this.callbacksEgress[clusterId]) {
                            this.callbacksEgress[clusterId].forEach((callback) => {
                                this.subscribeLog(clusterId, callback);
                            });
                        }
                        resolve();
                    };
                    this.socketsEgress[clusterId].socket.onerror = (e) => {
                        this.socketsEgress[clusterId]?.socket.close(3000, e ? `${e}` : 'unknown error');
                        reject(e);
                    };
                    this.socketsEgress[clusterId].socket.onclose = (e) => {
                        if (e) {
                            console.warn(`Socket is unexpectedly closed. Reconnect will be attempted in ${1000 * nRetry} millis.`, e.reason);
                            setTimeout(() => {
                                this.connect(clusterId, nRetry + 1);
                            }, 1000 * nRetry);
                        }
                    };
                });
            }
        }
        return Promise.all([promise1, promise2].filter((v) => !!v));
    }

    private closeSocketIngress(clusterId: string) {
        const socket = this.socketsIngress[clusterId];
        try {
            socket.socket.close();
            console.debug('ingress socket closed successfully');
        } catch (e) {
            console.error('could not close the ingress socket', e);
        } finally {
            delete this.socketsIngress[clusterId];
        }
    }

    private closeSocketEgress(clusterId: string) {
        delete this.callbacksEgress[clusterId];
        const subscribeSocket = this.socketsEgress[clusterId];
        if (subscribeSocket) {
            try {
                subscribeSocket.socket.close();
                console.debug('subscribe socket closed successfully');
            } catch (e) {
                console.warn('could not close the subscribe socket', e);
            } finally {
                delete this.socketsEgress[clusterId];
            }
        }
    }

    close(clusterId: string): Promise<void> {
        this.closeSocketIngress(clusterId);
        this.closeSocketEgress(clusterId);
        return Promise.resolve();
    }

    async broadcastLog(clusterId: string, event: AnyClusterEventEgress): Promise<void> {
        const socket = this.socketsIngress[clusterId];
        if (!socket) {
            return Promise.reject(new Error('Call connect first'));
        }
        const promise = new Promise<void>((resolve, reject) => {
            try {
                if (socket.socket.readyState !== WebSocket.OPEN) {
                    return reject(new Error('Socket is not open'));
                }
                socket.socket.send(JSON.stringify(['publish', clusterId, encodeURIComponent(JSON.stringify(event))]));
                resolve();
            } catch (e) {
                reject(e);
            }
        });
        return promise;
    }

    subscribeLog(clusterId: string, callback: (event: AnyClusterEventEgress) => void | ((event: AnyClusterEventEgress) => Promise<void>)): Promise<void> {
        this.callbacksEgress[clusterId] = this.callbacksEgress[clusterId] || [];
        this.callbacksEgress[clusterId].push(callback);
        const subscribeSocket = this.socketsEgress[clusterId];
        if (!subscribeSocket) {
            return Promise.reject(new Error('Call connect first'));
        }
        if (!subscribeSocket.isSubscribed) {
            const promise = new Promise<void>((resolve, reject) => {
                try {
                    if (subscribeSocket.socket.readyState !== WebSocket.OPEN) {
                        return reject(new Error('Socket is not open'));
                    }
                    subscribeSocket.isSubscribed = true;
                    subscribeSocket.socket.send(JSON.stringify(['subscribe', clusterId]));

                    subscribeSocket.socket.onmessage = (messageStr) => {
                        try {
                            const message = JSON.parse(messageStr.data || 'null');
                            if (message && message.subscribe && typeof message.subscribe !== 'number' && typeof message.subscribe[2] !== 'number') {
                                this.callbacksEgress[clusterId].forEach((callback) => {
                                    const v = decodeURIComponent(message.subscribe[2]);
                                    if (v === 'tick') {
                                        // ignore
                                        return;
                                    }
                                    callback(JSON.parse(v));
                                });
                            }
                        } catch (e) {
                            console.warn('Ignore the error', e);
                        }
                    };
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
            return promise;
        } else {
            return Promise.resolve();
        }
    }
}
