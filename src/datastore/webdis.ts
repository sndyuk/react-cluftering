import assert from 'assert';
import { AnyClusterEventLog } from '../internal/state';
import { Datastore } from './core';

function makeKeyNameForLog(clusterId: string) {
    return `log-${clusterId}`;
}

export type WebdisDatastoreClientOptions = {
    ssl?: boolean;
    keyNameForLog?: (clusterId: string) => string;
};

export class WebdisDatastoreClient implements Datastore {
    protected makeKeyNameForLog;
    protected ssl: boolean;
    constructor(protected host: string, protected port: number, options: WebdisDatastoreClientOptions = {}) {
        this.makeKeyNameForLog = options.keyNameForLog || makeKeyNameForLog;
        this.ssl = options.ssl !== false;
    }

    async appendLogs(clusterId: string, events: AnyClusterEventLog[]): Promise<void> {
        const response: { rpush: number } = await (
            await fetch(`${this.ssl ? 'https' : 'http'}://${this.host}:${this.port}`, {
                method: 'POST',
                body: `rpush/${this.makeKeyNameForLog(clusterId)}/${events.map((e) => encodeURIComponent(JSON.stringify(e))).join('/')}`,
            })
        ).json();
        const persistedId = response.rpush;
        assert(persistedId);
    }
    async fetchLogs(clusterId: string, startAt: number, endAt: number): Promise<AnyClusterEventLog[]> {
        const data: { lrange: string[] } = await (await fetch(`${this.ssl ? 'https' : 'http'}://${this.host}:${this.port}/lrange/${this.makeKeyNameForLog(clusterId)}/0/-1`)).json();
        if (data.lrange.length === 0) {
            return [];
        }
        // Restore the cluster logs
        const logIdsMemo: { [logId: number]: boolean } = {};
        const events: AnyClusterEventLog[] = data.lrange
            .map((v) => {
                try {
                    return JSON.parse(decodeURIComponent(v) || 'null') as AnyClusterEventLog | null;
                } catch (e) {
                    console.warn('could not parse the event:', v, e);
                    return null;
                }
            })
            .filter((e): e is AnyClusterEventLog => e !== null)
            .filter((e: AnyClusterEventLog) => {
                if (!(e.logId >= startAt && (e.logId <= endAt || endAt === -1))) {
                    return false;
                }
                // Remove duplicated events
                if (logIdsMemo[e.logId]) {
                    return false;
                }
                logIdsMemo[e.logId] = true;
                return true;
            });
        return events;
    }
}
