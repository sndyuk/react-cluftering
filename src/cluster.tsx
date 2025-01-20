import assert from 'assert';
import React, { useEffect, useState } from 'react';
import { RecoilRoot, selector, useRecoilCallback, useRecoilValue } from 'recoil';
import { useDebounceEffect } from './internal/helper/useDebounceEffect';
import { BackgroundEvents } from './internal';
import Clients from './internal/client';
import { clusterStateAtom, clusterInitialEventLogsAtom, ClusterEventEgress, TermCommittedEventData, typedClusterEventEgressAtom, typedClusterEventIngressAtom, typedClusterEventLogsAtom, TermCreatedEventData, clusterEventLogsAtom, ClusterEventLog, AnyClusterEventLog, myClientStateAtom } from './internal/state';
import EventStream from './internal/stream';
import { Datastore } from './datastore';
import { Rpc } from './rpc';

type Props = {
    id: string;
    clientId: string;
    datastore: Datastore;
    rpc: Rpc;
    termDurationMillis?: number;
    metadata?: { [key: string]: string };
};

export default function Cluster(props: Props) {
    console.debug(`Cluster created: clusterId=${props.id}, clientId=${props.clientId}`);
    return (
        <RecoilRoot key={props.id}>
            <Clients {...props} />
            <Underlying {...props} />
        </RecoilRoot>
    );
}

const closeTimeouts: { [key: string]: NodeJS.Timeout } = {};

function Underlying(props: Props) {
    const myClientState = useRecoilValue(myClientStateAtom);
    const [connected, setConnected] = useState(false);

    // Connect to the other cients of the cluster.
    useEffect(() => {
        if (!myClientState) {
            return;
        }
        if (myClientState.state === 'offline') {
            setConnected(false);
            closeTimeouts[props.id] = setTimeout(
                () => {
                    delete closeTimeouts[props.id];
                    props.rpc.close(props.id);
                },
                // Wait a moment until the socket becomes free.
                1000
            );
        } else if (myClientState.state === 'online') {
            const closeTimeout = closeTimeouts[props.id];
            if (closeTimeout) {
                clearTimeout(closeTimeout);
                delete closeTimeouts[props.id];
            }
            if (!connected) {
                props.rpc
                    .connect(props.id)
                    .then(() => {
                        setConnected(true);
                    })
                    .catch((e) => {
                        setConnected(false);
                        console.error('RPC connection error', e);
                        BackgroundEvents.dispatchEvent('backendError', props.id, {
                            message: 'could not connect to the cluster.',
                            cause: e,
                        });
                    });
            }
        }
    }, [myClientState]);

    return connected ? (
        <>
            <EventStream {...props} />
            <CommitTerm {...props} />
            <TermCommittedEventHandler {...props} />
            <ClusterState {...props} />
            <HandleInitialEvents {...props} />
            <Initialize {...props} />
        </>
    ) : (
        <></>
    );
}

const eventLogsSelector = selector({
    key: 'eventLogsSelector',
    get: ({ get }) => {
        const events = get(typedClusterEventLogsAtom());
        // index 0 of the event is 'termCreated' that always exists.
        // return null instread of [] to ignore re-render
        return events.length > 1 ? events : null;
    },
});

function CommitTerm({ id, clientId, datastore, termDurationMillis = 3000 }: Props) {
    const persistState = useRecoilCallback(
        ({ set, snapshot }) =>
            async (force = false) => {
                let events = snapshot.getLoadable(eventLogsSelector).getValue();
                if (!events) {
                    return;
                }
                const me = snapshot.getLoadable(myClientStateAtom).getValue();
                assert(me);
                // The primary clent is responsible for persisting the state.
                if (me.primary || force) {
                    console.debug('Persist the cluster state');

                    const termCreatedEvent = events[0];
                    if (termCreatedEvent.type === 'termporaryTermMarker') {
                        // The client has became primary.
                        // Replace temporaryTermMaker to termCreated event.
                        events = events.slice();
                        events[0] = { ...termCreatedEvent, type: 'termCreated' };
                        delete events[0].volatile;
                    } else {
                        assert(events[0].type === 'termCreated', 'Invalid logs state');
                    }
                    assert(
                        events.every((e) => !e.volatile),
                        `volatile event must not be stored. ${events}`
                    );

                    // Renumber the log id.
                    const firstLogId = events[0].logId;
                    const indexedEvents = events.map((v, i) => ({ ...v, logId: firstLogId + i }));
                    // Commit the logs.
                    try {
                        await datastore.appendLogs(id, indexedEvents);
                    } catch (e) {
                        console.error(e);
                        BackgroundEvents.dispatchEvent('backendError', id, {
                            message: 'datastore#AppendLogs returns an error.',
                            unsavedEvents: indexedEvents,
                            cause: e,
                        });
                        return;
                    }
                    // When the logs is persisted, clear logs and setup the new term.
                    const currentTermCreatedEvent = indexedEvents[0].data as TermCreatedEventData;
                    const currentTerm = currentTermCreatedEvent.term;
                    const newTerm = currentTerm + 1;
                    const lastLogId = indexedEvents[indexedEvents.length - 1].logId;
                    console.debug(`Committed the term: term=${currentTerm}, first logId=${firstLogId}, last logId=${lastLogId}`);
                    const newTermCreatedEventData = {
                        term: newTerm,
                        createdAt: Date.now(),
                    };
                    set(typedClusterEventLogsAtom<'termCreated'>(), [{ type: 'termCreated', clientId, logId: lastLogId + 1, data: newTermCreatedEventData }]);

                    // Notify the events has been stored for sure.
                    set(typedClusterEventIngressAtom<'termCommitted'>(), {
                        type: 'termCommitted',
                        volatile: true,
                        data: {
                            term: currentTerm,
                            createdAt: newTermCreatedEventData.createdAt,
                            firstLogId,
                            lastLogId,
                        },
                    });
                }
            },
        []
    );

    const events = useRecoilValue(eventLogsSelector);

    // Persist the state to the database every 3 seconds after the last change.
    useDebounceEffect(() => persistState(), termDurationMillis, [events]);

    // Check the state is consistent with the database for every 5 seconds.
    const timeout = termDurationMillis + 2000;
    useDebounceEffect(
        () => {
            // If the state is consistent, events becomes null.
            if (!events) {
                return;
            }
            if (events.length >= 1) {
                // events should be empty. If not, the state is inconsistent with the database. Forcibly persist the state.
                persistState(true);
            }
        },
        timeout,
        [events]
    );

    // On offine, persist the state.
    useEffect(
        () => () => {
            persistState();
        },
        []
    );
    return <></>;
}

const termCommittedEventSelector = selector({
    key: 'termCommittedEventSelector',
    get: ({ get }) => {
        const event = get(typedClusterEventEgressAtom<'termCommitted'>());
        return event?.type === 'termCommitted' ? event : null;
    },
});

function TermCommittedEventHandler({ id, clientId, datastore }: Props) {
    const event = useRecoilValue(termCommittedEventSelector);

    const reconstructStateMachine = useRecoilCallback(
        ({ set, snapshot }) =>
            async (id: string, syncFrom: number) => {
                console.debug('reconstruct the state machine');
                let leaderLogs;
                try {
                    leaderLogs = await datastore.fetchLogs(id, syncFrom, -1);
                } catch (e) {
                    console.error(e);
                    BackgroundEvents.dispatchEvent('backendError', id, {
                        message: 'datastore#fetchLogs returns an error.',
                        unsavedEvents: [],
                        cause: e,
                    });
                    return;
                }
                assert(leaderLogs.length > 0);
                const myLogs = await snapshot.getPromise(clusterInitialEventLogsAtom);
                const committed = syncFrom > 0 ? myLogs.slice(0, myLogs.findIndex((v) => v.logId === syncFrom) - 1) : [];
                const newLogs = [...committed, ...leaderLogs];
                set(clusterInitialEventLogsAtom, newLogs);
            },
        []
    );

    const handleTermCommittedEvent = useRecoilCallback(
        ({ set, snapshot }) =>
            async (id: string, event: ClusterEventEgress<TermCommittedEventData> | null) => {
                if (event && event.clientId !== clientId) {
                    const myLogs = await snapshot.getPromise(clusterEventLogsAtom);
                    const currentTermEvent = myLogs[0] as ClusterEventLog<TermCreatedEventData>;
                    assert(currentTermEvent);
                    const myLastLogId = myLogs.length > 0 ? myLogs[myLogs.length - 1].logId : 0;
                    if (currentTermEvent.data.term !== event.data.term) {
                        console.warn(`The term doesn't match. my term=${currentTermEvent.data.term}, current term=${event.data.term}`);
                        await reconstructStateMachine(id, 0);
                    } else if (myLastLogId < event.data.lastLogId) {
                        console.warn(`The log id doesn't match. my logId=${myLastLogId}, current LogId=${event.data.lastLogId}.`);
                        await reconstructStateMachine(id, event.data.firstLogId);
                    } else {
                        // The state is consistent.
                    }
                    set(typedClusterEventLogsAtom<'termCreated'>(), [
                        {
                            type: 'termCreated',
                            clientId: event.clientId,
                            logId: event.data.lastLogId + 1,
                            data: {
                                term: event.data.term + 1,
                                createdAt: event.data.createdAt,
                            },
                        },
                    ]);
                }
            },
        []
    );

    useEffect(() => {
        handleTermCommittedEvent(id, event);
    }, [event]);

    return <></>;
}

function ClusterState({ id }: Props) {
    const state = useRecoilValue(clusterStateAtom);
    useEffect(() => {
        BackgroundEvents.dispatchEvent('state', id, { state });
    }, [state]);
    return <></>;
}

function Initialize({ id, clientId, datastore }: Props) {
    const [initialized, setInitialized] = React.useState(false);
    const constructStateMachine = useRecoilCallback(
        ({ set }) =>
            async (id: string) => {
                console.debug('construct the state machine');
                let leaderLogs: AnyClusterEventLog[];
                try {
                    leaderLogs = await datastore.fetchLogs(id, 0, -1);
                } catch (e) {
                    console.error(e);
                    BackgroundEvents.dispatchEvent('backendError', id, {
                        message: 'datastore#fetchLogs returns an error.',
                        unsavedEvents: [],
                        cause: e,
                    });
                    return;
                }
                if (leaderLogs.length > 0) {
                    // Set the term marker. This will be ignored(removed) or replaced with the actual termCreated event once it's committed(if it's the leader client).
                    const previousTermEvent = leaderLogs
                        .slice()
                        .reverse()
                        .find((v) => v.type === 'termCreated');
                    assert(previousTermEvent);
                    set(typedClusterEventLogsAtom<'termporaryTermMarker'>(), [
                        {
                            type: 'termporaryTermMarker',
                            clientId,
                            logId: leaderLogs[leaderLogs.length - 1].logId + 1,
                            volatile: true,
                            data: {
                                term: previousTermEvent.data.term + 1,
                                createdAt: Date.now(),
                            },
                        },
                    ]);

                    set(clusterInitialEventLogsAtom, leaderLogs);
                } else {
                    // This is the new cluster. Initialize the logs.
                    const event: ClusterEventLog<TermCreatedEventData> = {
                        type: 'termCreated',
                        clientId,
                        logId: 0,
                        data: {
                            term: 0,
                            createdAt: Date.now(),
                        },
                    };
                    set(typedClusterEventLogsAtom<'termCreated'>(), [event]);
                    try {
                        await datastore.appendLogs(id, [event]);
                    } catch (e) {
                        BackgroundEvents.dispatchEvent('backendError', id, {
                            message: 'datastore#appendLogs returns an error.',
                            unsavedEvents: [event],
                            cause: e,
                        });
                        return;
                    }
                }
                set(clusterStateAtom, 'active');
            },
        []
    );

    useEffect(() => {
        if (!initialized) {
            constructStateMachine(id).then(() => {
                setInitialized(true);
            });
            return;
        }
    }, [initialized]);
    return <></>;
}

function HandleInitialEvents({ id }: Props) {
    const logs = useRecoilValue(clusterInitialEventLogsAtom);
    useEffect(() => {
        BackgroundEvents.dispatchEvent('initialEvents', id, { logs });
    });
    return <></>;
}
