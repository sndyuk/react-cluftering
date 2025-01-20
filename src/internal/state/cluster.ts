import { atom, RecoilState } from 'recoil';
import { Client, ClientState } from '../client';

export type ClusterState = 'loading' | 'active' | 'pause' | 'error';

export interface TermCreatedEventData {
    term: number;
    createdAt: number;
}

export interface TermCommittedEventData extends TermCreatedEventData {
    // Log id at the beginning of the term.
    firstLogId: number;
    // Log id at the end of the term.
    lastLogId: number;
}

export interface MemberModifiedEventData {
    readonly state: ClientState;
    readonly primary: boolean;
    readonly nonce: number;
    readonly broadcast: boolean;
}

// Restrict event types
export interface ClusterEvents {
    termCreated: TermCreatedEventData;
    termporaryTermMarker: TermCreatedEventData;
    termCommitted: TermCommittedEventData;
    memberModified: MemberModifiedEventData;
}

export const allClusterEventKeys: (keyof ClusterEvents)[] = ['termCreated', 'termCommitted', 'memberModified'];

export type UndoState = {
    undoing?: boolean;
    redoing?: boolean;
};

export interface ClusterEvent<EventType> {
    type: keyof ClusterEvents;
    data: EventType;

    // Do not set false instead of undefined for valatile and undo, otherwise datastore may persist the redundant property. Set the value only when it's true.
    volatile?: undefined | true;
    undo?: UndoState;
}

export type ClusterEventEgress<EventType> = {
    clientId: string;
    term: number;
} & ClusterEvent<EventType>;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyClusterEvent = Omit<ClusterEvent<unknown>, 'type'> & { type: any; data: any };
export type AnyClusterEventEgress = Omit<ClusterEventEgress<unknown>, 'type'> & {
    type: any;
    data: any;
};
export type ClusterEventLog<EventType> = {
    logId: number;
} & Omit<ClusterEventEgress<EventType>, 'term'>;
export type AnyClusterEventLog = {
    logId: number;
} & Omit<AnyClusterEventEgress, 'term'>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const clusterStateAtom = atom<ClusterState>({
    key: 'clusterStateAtom',
    default: 'loading',
});

export const clusterInitialEventLogsAtom = atom<AnyClusterEventLog[]>({
    key: 'clusterInitialEventLogsAtom',
    default: [],
});

export const clusterEventLogsAtom = atom<AnyClusterEventLog[]>({
    key: 'clusterEventLogsAtom',
    default: [],
});

export const typedClusterEventLogsAtom = <A extends keyof ClusterEvents>() => {
    return clusterEventLogsAtom as RecoilState<ClusterEventLog<ClusterEvents[A]>[]>;
};

export const clusterEventEgressAtom = atom<AnyClusterEventEgress | null>({
    key: 'clusterEventEgressAtom',
    default: null,
});

export const typedClusterEventEgressAtom = <A extends keyof ClusterEvents>() => {
    return clusterEventEgressAtom as RecoilState<ClusterEventEgress<ClusterEvents[A]>>;
};

export const clusterEventIngressAtom = atom<AnyClusterEvent | null>({
    key: 'clusterEventIngressAtom',
    default: null,
});

export const typedClusterEventIngressAtom = <A extends keyof ClusterEvents>() => {
    return clusterEventIngressAtom as RecoilState<ClusterEvent<ClusterEvents[A]>>;
};

export const myClientStateAtom = atom<Client | null>({
    key: 'myClientStateAtom',
    default: null,
});

export const activeClusterClientsAtom = atom<Client[]>({
    key: 'activeClusterClientsAtom',
    default: [],
});
