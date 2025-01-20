import assert from 'assert';
import React, { useEffect } from 'react';
import { useRecoilCallback, useRecoilValue } from 'recoil';
import { BackgroundEvents } from '..';
import { allClusterEventKeys, AnyClusterEvent, AnyClusterEventEgress, AnyClusterEventLog, clusterEventEgressAtom, clusterEventIngressAtom, clusterEventLogsAtom, clusterStateAtom, UndoState } from '../state';
import { Rpc } from '../../rpc';
import useSubscribeLog from './useSubscribeLog';

type Props = {
    id: string;
    clientId: string;
    rpc: Rpc;
};

function Ingress({ id, clientId, rpc }: Props) {
    const sendEvent = useRecoilCallback(
        ({ set, snapshot }) =>
            async (dirtyEvent: AnyClusterEvent | null, undo?: UndoState) => {
                if (!dirtyEvent) {
                    return;
                }
                const event = removeVolatileProperties(dirtyEvent);

                assert(event.type);
                let term: number;
                if (!event.volatile) {
                    // Save the non-volatile event to my logs first
                    const events = await snapshot.getPromise(clusterEventLogsAtom);
                    set(clusterEventLogsAtom, [...events, { ...event, clientId, logId: events[events.length - 1].logId + 1 }]);

                    // Keep my events for undo
                    if (!undo?.undoing) {
                        undoHistory.push(dirtyEvent);
                        if (!undo?.redoing) {
                            redoHistory = [];
                        }
                        BackgroundEvents.dispatchEvent('undoHistoryChanged', id, {
                            undoCount: undoHistory.length,
                            redoCount: redoHistory.length,
                        });
                    }

                    term = events[0].data.term;
                } else {
                    term = -1; // unknown yet. It won't be a problem since it's volatile event.
                }
                // Broadcast the event to other clients
                await rpc.broadcastLog(id, { ...event, clientId, term });

                if (!allClusterEventKeys.includes(event.type)) {
                    BackgroundEvents.dispatchEvent('eventSubscribe', id, { event: { ...dirtyEvent, clientId, term }, myEvent: true });
                }
            },
        []
    );

    // undo/redo
    const undoHistory: AnyClusterEvent[] = [];
    let redoHistory: AnyClusterEvent[] = [];
    const handleUndoEvent = useRecoilCallback(
        ({ set }) =>
            async (redo: boolean) => {
                let event: AnyClusterEvent | undefined = undefined;
                if (redo) {
                    const lastUndoEvent = redoHistory.pop();
                    if (lastUndoEvent) {
                        console.debug('redo:', lastUndoEvent);
                        event = lastUndoEvent;
                    }
                } else {
                    const lastEvent = undoHistory.pop();
                    if (lastEvent) {
                        console.debug('undo:', lastEvent);
                        redoHistory.push(lastEvent);
                        assert(lastEvent.data._cancel);
                        event = { ...lastEvent, data: lastEvent.data._cancel }; // FIXME be type safe and maintenable.
                    }
                }
                if (event) {
                    // Trigger internal event handlers
                    const undo = { undoing: !redo, redoing: redo };
                    set(clusterEventEgressAtom, { ...event, undo } as AnyClusterEventEgress);
                    // Publish
                    sendEvent(event, undo);
                }
                BackgroundEvents.dispatchEvent('undoHistoryChanged', id, {
                    undoCount: undoHistory.length,
                    redoCount: redoHistory.length,
                });
            },
        []
    );
    useEffect(() => {
        BackgroundEvents.addEventListener('undo', id, (e) => {
            handleUndoEvent(e.redo);
        });
        return () => BackgroundEvents.removeEventListener('undo', id);
    }, []);

    return (
        <>
            <InternalIngressEventLoop sendEvent={sendEvent} />
            <IngressEventLoop id={id} />
        </>
    );
}

function removeVolatileProperties<T extends object>(v: T): T {
    const newData = {} as T;
    for (const key of Object.keys(v)) {
        if (key[0] !== '_') {
            if (typeof v[key] === 'object' && !Array.isArray(v[key])) {
                newData[key] = removeVolatileProperties(v[key]);
            } else {
                newData[key] = v[key];
            }
        }
    }
    return newData;
}

function InternalIngressEventLoop({ sendEvent }: { sendEvent: (event: AnyClusterEvent | null) => void }) {
    const event = useRecoilValue(clusterEventIngressAtom);
    useEffect(() => {
        if (event) {
            sendEvent(event);
        }
    }, [event]);
    return <></>;
}

function IngressEventLoop({ id }: { id: string }) {
    const publishEvent = useRecoilCallback(({ set }) => (event: AnyClusterEvent) => {
        set(clusterEventIngressAtom, event);
    });

    useEffect(() => {
        BackgroundEvents.addEventListener('eventPublish', id, (e) => {
            publishEvent(e.event);
        });
        return () => BackgroundEvents.removeEventListener('eventPublish', id);
    }, []);

    return <></>;
}

function Egress(props: Props) {
    return (
        <>
            <InternalEgressEventLoop {...props} />
            <EgressEventLoop {...props} />
        </>
    );
}

function InternalEgressEventLoop({ id, clientId, rpc }: Props) {
    const lastEvent = useSubscribeLog(id, rpc);
    const handleEvent = useRecoilCallback(
        ({ set, snapshot }) =>
            async (event: AnyClusterEventEgress) => {
                assert(event.type);
                if (!event.volatile) {
                    // Save the event first
                    const myEvents = await snapshot.getPromise(clusterEventLogsAtom);
                    const myLastEvent = myEvents[myEvents.length - 1];
                    const newEvent: AnyClusterEventLog = { ...event, logId: myLastEvent.logId + 1 };
                    set(clusterEventLogsAtom, [...myEvents, newEvent]);
                }

                // Trigger internal event handlers
                set(clusterEventEgressAtom, event);
            },
        []
    );

    useEffect(() => {
        // Skip events published by the client
        if (lastEvent && lastEvent.clientId !== clientId) {
            handleEvent(lastEvent);
        }
    }, [lastEvent]);
    return <></>;
}

function EgressEventLoop({ id }: { id: string }) {
    const event = useRecoilValue(clusterEventEgressAtom);
    useEffect(() => {
        if (event && !allClusterEventKeys.includes(event.type)) {
            BackgroundEvents.dispatchEvent('eventSubscribe', id, { event });
        }
    }, [event]);
    return <></>;
}

export default function EventStream(props: Props) {
    const clusterState = useRecoilValue(clusterStateAtom);
    return clusterState === 'active' ? (
        <>
            <Ingress {...props} />
            <Egress {...props} />
        </>
    ) : (
        <></>
    );
}
