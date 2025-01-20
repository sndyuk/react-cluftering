import { Client } from "./client";
import { AnyClusterEvent, AnyClusterEventEgress, AnyClusterEventLog, ClusterState } from "./state";
export default interface InternalEvents {
    'state': ClusterStateEvent;
    'electionRequired': Record<string, never>;
    'resyncRequired': WarnEvent;
    'backendError': WarnEvent;
    'clientsChanged': ClientsChangedEvent;
    'clientStateChanged': ClientStateChangedEvent;
    'eventPublish': EventPublishEvent;
    'eventSubscribe': EventSubscribeEvent;
    'initialEvents': InitialEventsEvent;
    'undo': UndoEvent;
    'undoHistoryChanged': UndoHistoryChangedEvent;
}
export interface WarnEvent {
    readonly message: string;
    readonly unsavedEvents?: AnyClusterEventLog[];
    readonly cause?: Error;
}
export interface ClusterStateEvent {
    readonly state: ClusterState;
}
export interface EventPublishEvent {
    readonly event: AnyClusterEvent;
}
export interface EventSubscribeEvent {
    readonly event: AnyClusterEventEgress;
    readonly myEvent?: boolean;
}
export interface TypedEventSubscribeEvent<T extends AnyClusterEventEgress> extends EventSubscribeEvent {
    readonly event: T;
}
export interface InitialEventsEvent {
    readonly logs: AnyClusterEventLog[];
}
export interface UndoEvent {
    readonly redo: boolean;
}
export interface UndoHistoryChangedEvent {
    readonly undoCount: number;
    readonly redoCount: number;
}
export interface ClientsChangedEvent {
    readonly activeClients: Client[];
}
export interface ClientStateChangedEvent {
    readonly client: Client;
}
