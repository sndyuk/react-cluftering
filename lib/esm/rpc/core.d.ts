import { AnyClusterEventEgress } from "../internal/state";
export interface Rpc {
    connect(clusterId: string): Promise<unknown>;
    close(clusterId: string): Promise<unknown>;
    broadcastLog(clusterId: string, event: AnyClusterEventEgress): Promise<void>;
    subscribeLog(clusterId: string, callback: (event: AnyClusterEventEgress) => void | ((event: AnyClusterEventEgress) => Promise<void>)): Promise<void>;
}
