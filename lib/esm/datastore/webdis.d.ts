import { AnyClusterEventLog } from "../internal/state";
import { Datastore } from "./core";
export type WebdisDatastoreClientOptions = {
    ssl?: boolean;
    keyNameForLog?: (clusterId: string) => string;
};
export declare class WebdisDatastoreClient implements Datastore {
    protected host: string;
    protected port: number;
    protected makeKeyNameForLog: (clusterId: string) => string;
    protected ssl: boolean;
    constructor(host: string, port: number, options?: WebdisDatastoreClientOptions);
    appendLogs(clusterId: string, events: AnyClusterEventLog[]): Promise<void>;
    fetchLogs(clusterId: string, startAt: number, endAt: number): Promise<AnyClusterEventLog[]>;
}
