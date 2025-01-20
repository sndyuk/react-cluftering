import { RecoilState } from "recoil";
import { Client, ClientState } from "../client";
export type ClusterState = 'loading' | 'active' | 'pause' | 'error';
export interface TermCreatedEventData {
    term: number;
    createdAt: number;
}
export interface TermCommittedEventData extends TermCreatedEventData {
    firstLogId: number;
    lastLogId: number;
}
export interface MemberModifiedEventData {
    readonly state: ClientState;
    readonly primary: boolean;
    readonly nonce: number;
    readonly broadcast: boolean;
}
export interface ClusterEvents {
    'termCreated': TermCreatedEventData;
    'termporaryTermMarker': TermCreatedEventData;
    'termCommitted': TermCommittedEventData;
    'memberModified': MemberModifiedEventData;
}
export declare const allClusterEventKeys: (keyof ClusterEvents)[];
export type UndoState = {
    undoing?: boolean;
    redoing?: boolean;
};
export interface ClusterEvent<EventType> {
    type: keyof ClusterEvents;
    data: EventType;
    volatile?: undefined | true;
    undo?: UndoState;
}
export type ClusterEventEgress<EventType> = {
    clientId: string;
    term: number;
} & ClusterEvent<EventType>;
export type AnyClusterEvent = Omit<ClusterEvent<unknown>, 'type'> & {
    type: any;
    data: any;
};
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
export declare const clusterStateAtom: RecoilState<ClusterState>;
export declare const clusterInitialEventLogsAtom: RecoilState<AnyClusterEventLog[]>;
export declare const clusterEventLogsAtom: RecoilState<AnyClusterEventLog[]>;
export declare const typedClusterEventLogsAtom: <A extends keyof ClusterEvents>() => RecoilState<ClusterEventLog<ClusterEvents[A]>[]>;
export declare const clusterEventEgressAtom: RecoilState<AnyClusterEventEgress | null>;
export declare const typedClusterEventEgressAtom: <A extends keyof ClusterEvents>() => RecoilState<ClusterEventEgress<ClusterEvents[A]>>;
export declare const clusterEventIngressAtom: RecoilState<AnyClusterEvent | null>;
export declare const typedClusterEventIngressAtom: <A extends keyof ClusterEvents>() => RecoilState<ClusterEvent<ClusterEvents[A]>>;
export declare const myClientStateAtom: RecoilState<Client | null>;
export declare const activeClusterClientsAtom: RecoilState<Client[]>;
