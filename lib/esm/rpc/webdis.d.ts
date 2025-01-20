/// <reference types="node" />
import { AnyClusterEventEgress } from "../internal/state";
import { Rpc } from "./core";
export type WebdisRpcClientOptions = {
    ssl?: boolean;
    pingIntervalSec?: number;
};
export declare class WebdisRpcClient implements Rpc {
    protected host: string;
    protected port: number;
    socketsIngress: {
        [clusterId: string]: {
            socket: WebSocket;
            pingTimer?: NodeJS.Timer;
        };
    };
    socketsEgress: {
        [clusterId: string]: {
            socket: WebSocket;
            isSubscribed: boolean;
        };
    };
    callbacksEgress: {
        [clusterId: string]: ((event: AnyClusterEventEgress) => void)[];
    };
    protected ssl: boolean;
    protected pingIntervalSec: number;
    constructor(host: string, port: number, options?: WebdisRpcClientOptions);
    connect(clusterId: string, nRetry?: number): Promise<unknown>;
    private closeSocketIngress;
    private closeSocketEgress;
    close(clusterId: string): Promise<void>;
    broadcastLog(clusterId: string, event: AnyClusterEventEgress): Promise<void>;
    subscribeLog(clusterId: string, callback: (event: AnyClusterEventEgress) => void | ((event: AnyClusterEventEgress) => Promise<void>)): Promise<void>;
}
