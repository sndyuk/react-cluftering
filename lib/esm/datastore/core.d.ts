import { AnyClusterEventLog } from "../internal/state";
export interface Datastore {
    appendLogs(clusterId: string, events: AnyClusterEventLog[]): Promise<void>;
    fetchLogs(clusterId: string, startAt: number, endAt: number): Promise<AnyClusterEventLog[]>;
}
