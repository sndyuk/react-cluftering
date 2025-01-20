import assert from 'assert';
import React, { useEffect, useCallback, useState } from 'react';
import { atom, selector, useRecoilCallback, useRecoilValue, RecoilRoot } from 'recoil';

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function useDebounceEffect(fn, waitTime, deps) {
    useEffect(() => {
        const t = setTimeout(() => {
            fn(...deps);
        }, waitTime);
        return () => {
            clearTimeout(t);
        };
    }, deps);
}

/* eslint-enable @typescript-eslint/no-explicit-any */
class BackgroundEventHandlers {
    constructor() {
        this.callbacks = [];
    }
    registerCallback(callback) {
        this.callbacks.push(callback);
    }
}
class BackgroundEvents {
    static addEventListener(eventName, key, callback) {
        const id = `${eventName}-${key}`;
        if (!this.events[id]) {
            this.events[id] = new BackgroundEventHandlers();
        }
        this.events[id].registerCallback(callback);
    }
    static dispatchEvent(eventName, key, event) {
        var _a;
        (_a = this.events[`${eventName}-${key}`]) === null || _a === void 0 ? void 0 : _a.callbacks.forEach((callback) => {
            callback(event);
        });
    }
    static removeEventListener(eventName, key) {
        delete this.events[`${eventName}-${key}`];
    }
}
BackgroundEvents.events = {};

const allClusterEventKeys = ['termCreated', 'termCommitted', 'memberModified'];
/* eslint-enable @typescript-eslint/no-explicit-any */
const clusterStateAtom = atom({
    key: 'clusterStateAtom',
    default: 'loading',
});
const clusterInitialEventLogsAtom = atom({
    key: 'clusterInitialEventLogsAtom',
    default: [],
});
const clusterEventLogsAtom = atom({
    key: 'clusterEventLogsAtom',
    default: [],
});
const typedClusterEventLogsAtom = () => {
    return clusterEventLogsAtom;
};
const clusterEventEgressAtom = atom({
    key: 'clusterEventEgressAtom',
    default: null,
});
const typedClusterEventEgressAtom = () => {
    return clusterEventEgressAtom;
};
const clusterEventIngressAtom = atom({
    key: 'clusterEventIngressAtom',
    default: null,
});
const typedClusterEventIngressAtom = () => {
    return clusterEventIngressAtom;
};
const myClientStateAtom = atom({
    key: 'myClientStateAtom',
    default: null,
});
const activeClusterClientsAtom = atom({
    key: 'activeClusterClientsAtom',
    default: [],
});

function Clients(props) {
    console.debug("Client created");
    return React.createElement(React.Fragment, null,
        React.createElement(Other, Object.assign({}, props)),
        React.createElement(Myself, Object.assign({}, props)),
        React.createElement(ActiveClients, Object.assign({}, props)),
        React.createElement(ClientState, Object.assign({}, props)));
}
const memberModifiedEventSelector = selector({
    key: 'clientEventSelector',
    get: ({ get }) => {
        const event = get(typedClusterEventEgressAtom());
        return (event === null || event === void 0 ? void 0 : event.type) === 'memberModified' ? event : null;
    },
});
function electPrimary(a, b) {
    if (a.nonce < b.nonce) {
        return a;
    }
    if (a.nonce > b.nonce) {
        return b;
    }
    return a.id < b.id ? a : b;
}
function Other({ clientId, id }) {
    const handleOtherClientEvent = useRecoilCallback(({ set, snapshot }) => (event) => {
        console.debug(`cluster[${id}]: Client event received`, event);
        const activeClients = snapshot.getLoadable(activeClusterClientsAtom).getValue();
        const otherClient = Object.assign(Object.assign({}, event.data), { id: event.clientId, broadcast: false });
        let newActiveClients;
        if (otherClient.state === 'online') {
            if (!activeClients.some(v => v.id === otherClient.id)) {
                // New client has joined.
                newActiveClients = [...activeClients, otherClient];
            }
            else {
                newActiveClients = activeClients;
            }
        }
        else {
            // Remove from activeClients
            newActiveClients = activeClients.filter(c => c.id !== otherClient.id);
        }
        // reset the primary flag
        const primaryClient = newActiveClients.reduce(electPrimary);
        newActiveClients = newActiveClients.map(c => (Object.assign(Object.assign({}, c), { primary: c.id === primaryClient.id })));
        set(activeClusterClientsAtom, newActiveClients);
        // When the client is active, notify the status to other clients.
        const me = newActiveClients.find(c => c.id === clientId);
        set(myClientStateAtom, me);
        if (me && !event.data.broadcast) {
            set(typedClusterEventIngressAtom(), { type: 'memberModified', volatile: true, data: Object.assign(Object.assign({}, me), { broadcast: true }) });
        }
    }, []);
    // on handle other client event
    const otherClientEvent = useRecoilValue(memberModifiedEventSelector);
    useEffect(() => {
        if (!otherClientEvent) {
            return;
        }
        handleOtherClientEvent(otherClientEvent);
    }, [otherClientEvent]);
    return React.createElement(React.Fragment, null);
}
// The static random number for the client which is used for electing the primary client.
const MY_NONCE = Number(`${Math.random()}`.replace('.', ''));
function Myself({ clientId, id, metadata }) {
    const ensurePrimaryClient = useRecoilCallback(({ set, snapshot }) => () => {
        const clients = snapshot.getLoadable(activeClusterClientsAtom).getValue();
        const primaryClient = clients.find(v => v.primary);
        if (primaryClient) {
            return;
        }
        // If no one is primary, make me primary.
        const me = snapshot.getLoadable(myClientStateAtom).getValue();
        assert(me);
        if (me.state !== 'online') {
            return;
        }
        const client = Object.assign(Object.assign({}, me), { primary: true });
        set(myClientStateAtom, client);
        set(activeClusterClientsAtom, [me, ...clients.filter(v => v.id !== me.id)]);
        set(typedClusterEventIngressAtom(), { type: 'memberModified', volatile: true, data: Object.assign(Object.assign({}, client), { broadcast: false }) });
    }, []);
    const onChangeClientState = useRecoilCallback(({ set, snapshot }) => (clientState) => {
        const clients = snapshot.getLoadable(activeClusterClientsAtom).getValue();
        const me = snapshot.getLoadable(myClientStateAtom).getValue();
        if (clientState === 'online') {
            if ((me === null || me === void 0 ? void 0 : me.state) === 'online') {
                // The client is already online.
                return;
            }
            // The client becomes online.
            console.debug("online");
            const client = { id: clientId, state: 'online', primary: false, nonce: me ? me.nonce : MY_NONCE, metadata };
            set(myClientStateAtom, client);
            // Clear the active clients.
            set(activeClusterClientsAtom, [client]);
            // This will trigger bradcasting from other online clients.
            set(typedClusterEventIngressAtom(), { type: 'memberModified', volatile: true, data: Object.assign(Object.assign({}, client), { broadcast: false }) });
            // Wait for other client responses. If not received, set myself as a primary.
            setTimeout(ensurePrimaryClient, 800);
        }
        else if (clientState === 'offline') {
            if (!me || me.state === 'offline') {
                // The client is not initiated yet or already offline.
                return;
            }
            // The client becomes offine.
            console.debug("offline");
            const client = Object.assign(Object.assign({}, me), { state: 'offline' });
            set(myClientStateAtom, client);
            set(activeClusterClientsAtom, clients.filter(c => c.id !== clientId));
            set(typedClusterEventIngressAtom(), { type: 'memberModified', volatile: true, data: Object.assign(Object.assign({}, client), { broadcast: false }) });
        }
        else if (clientState === 'inconsistent') {
            if ((me === null || me === void 0 ? void 0 : me.state) === 'offline' || (me === null || me === void 0 ? void 0 : me.state) === 'inconsistent') {
                // The client is offline or already inconsistent.
                return;
            }
            // The client state becomes inconsistent.
            console.debug("inconsistent");
            const client = { id: clientId, state: 'online', primary: false, nonce: me ? me.nonce : MY_NONCE, metadata };
            set(activeClusterClientsAtom, [client]);
            set(typedClusterEventIngressAtom(), { type: 'memberModified', volatile: true, data: Object.assign(Object.assign({}, client), { broadcast: false }) });
        }
    }, []);
    // Run on Init
    useEffect(() => onChangeClientState('online'), []);
    // Run on Visibilitychange
    const onVisibilitychange = useCallback(() => {
        onChangeClientState(document.visibilityState === 'visible' ? 'online' : 'offline');
    }, []);
    window.addEventListener('visibilitychange', onVisibilitychange, { passive: true });
    // Run on Stateinconsistent, custom event
    const onStateinconsistent = useCallback(() => {
        onChangeClientState('inconsistent');
    }, []);
    BackgroundEvents.addEventListener('electionRequired', id, onStateinconsistent);
    // Run on Unmount
    useEffect(() => () => {
        onChangeClientState('offline');
        BackgroundEvents.removeEventListener('electionRequired', id);
        window.removeEventListener('visibilitychange', onVisibilitychange);
    }, []);
    return React.createElement(React.Fragment, null);
}
function ActiveClients({ id }) {
    const activeClients = useRecoilValue(activeClusterClientsAtom);
    useEffect(() => {
        BackgroundEvents.dispatchEvent('clientsChanged', id, { activeClients });
    }, [activeClients]);
    return React.createElement(React.Fragment, null);
}
function ClientState({ id }) {
    const client = useRecoilValue(myClientStateAtom);
    useEffect(() => {
        // Null means the client is not initiated yet.
        if (client) {
            BackgroundEvents.dispatchEvent('clientStateChanged', id, { client });
        }
    }, [client]);
    return React.createElement(React.Fragment, null);
}

function useSubscribeLog(id, rpc) {
    const [event, setEvent] = useState(null);
    useEffect(() => {
        rpc.subscribeLog(id, (event) => {
            setEvent(event);
        });
    }, []);
    return event;
}

function Ingress({ id, clientId, rpc }) {
    const sendEvent = useRecoilCallback(({ set, snapshot }) => (dirtyEvent, undo) => __awaiter(this, void 0, void 0, function* () {
        if (!dirtyEvent) {
            return;
        }
        const event = removeVolatileProperties(dirtyEvent);
        assert(event.type);
        let term;
        if (!event.volatile) {
            // Save the non-volatile event to my logs first
            const events = yield snapshot.getPromise(clusterEventLogsAtom);
            set(clusterEventLogsAtom, [...events, Object.assign(Object.assign({}, event), { clientId, logId: events[events.length - 1].logId + 1 })]);
            // Keep my events for undo
            if (!(undo === null || undo === void 0 ? void 0 : undo.undoing)) {
                undoHistory.push(dirtyEvent);
                if (!(undo === null || undo === void 0 ? void 0 : undo.redoing)) {
                    redoHistory = [];
                }
                BackgroundEvents.dispatchEvent('undoHistoryChanged', id, {
                    undoCount: undoHistory.length,
                    redoCount: redoHistory.length,
                });
            }
            term = events[0].data.term;
        }
        else {
            term = -1; // unknown yet. It won't be a problem since it's volatile event.
        }
        // Broadcast the event to other clients
        yield rpc.broadcastLog(id, Object.assign(Object.assign({}, event), { clientId, term }));
        if (!allClusterEventKeys.includes(event.type)) {
            BackgroundEvents.dispatchEvent('eventSubscribe', id, { event: Object.assign(Object.assign({}, dirtyEvent), { clientId, term }), myEvent: true });
        }
    }), []);
    // undo/redo
    const undoHistory = [];
    let redoHistory = [];
    const handleUndoEvent = useRecoilCallback(({ set }) => (redo) => __awaiter(this, void 0, void 0, function* () {
        let event = undefined;
        if (redo) {
            const lastUndoEvent = redoHistory.pop();
            if (lastUndoEvent) {
                console.debug('redo:', lastUndoEvent);
                event = lastUndoEvent;
            }
        }
        else {
            const lastEvent = undoHistory.pop();
            if (lastEvent) {
                console.debug('undo:', lastEvent);
                redoHistory.push(lastEvent);
                assert(lastEvent.data._cancel);
                event = Object.assign(Object.assign({}, lastEvent), { data: lastEvent.data._cancel }); // FIXME be type safe and maintenable.
            }
        }
        if (event) {
            // Trigger internal event handlers
            const undo = { undoing: !redo, redoing: redo };
            set(clusterEventEgressAtom, Object.assign(Object.assign({}, event), { undo }));
            // Publish
            sendEvent(event, undo);
        }
        BackgroundEvents.dispatchEvent('undoHistoryChanged', id, {
            undoCount: undoHistory.length,
            redoCount: redoHistory.length,
        });
    }), []);
    useEffect(() => {
        BackgroundEvents.addEventListener('undo', id, e => {
            handleUndoEvent(e.redo);
        });
        return () => BackgroundEvents.removeEventListener('undo', id);
    }, []);
    return React.createElement(React.Fragment, null,
        React.createElement(InternalIngressEventLoop, { sendEvent: sendEvent }),
        React.createElement(IngressEventLoop, { id: id }));
}
function removeVolatileProperties(v) {
    const newData = {};
    for (const key of Object.keys(v)) {
        if (key[0] !== '_') {
            if (typeof v[key] === 'object' && !Array.isArray(v[key])) {
                newData[key] = removeVolatileProperties(v[key]);
            }
            else {
                newData[key] = v[key];
            }
        }
    }
    return newData;
}
function InternalIngressEventLoop({ sendEvent }) {
    const event = useRecoilValue(clusterEventIngressAtom);
    useEffect(() => {
        if (event) {
            sendEvent(event);
        }
    }, [event]);
    return React.createElement(React.Fragment, null);
}
function IngressEventLoop({ id }) {
    const publishEvent = useRecoilCallback(({ set }) => (event) => {
        set(clusterEventIngressAtom, event);
    });
    useEffect(() => {
        BackgroundEvents.addEventListener('eventPublish', id, e => {
            publishEvent(e.event);
        });
        return () => BackgroundEvents.removeEventListener('eventPublish', id);
    }, []);
    return React.createElement(React.Fragment, null);
}
function Egress(props) {
    return React.createElement(React.Fragment, null,
        React.createElement(InternalEgressEventLoop, Object.assign({}, props)),
        React.createElement(EgressEventLoop, Object.assign({}, props)));
}
function InternalEgressEventLoop({ id, clientId, rpc }) {
    const lastEvent = useSubscribeLog(id, rpc);
    const handleEvent = useRecoilCallback(({ set, snapshot }) => (event) => __awaiter(this, void 0, void 0, function* () {
        assert(event.type);
        if (!event.volatile) {
            // Save the event first
            const myEvents = yield snapshot.getPromise(clusterEventLogsAtom);
            const myLastEvent = myEvents[myEvents.length - 1];
            const newEvent = Object.assign(Object.assign({}, event), { logId: myLastEvent.logId + 1 });
            set(clusterEventLogsAtom, [...myEvents, newEvent]);
        }
        // Trigger internal event handlers
        set(clusterEventEgressAtom, event);
    }), []);
    useEffect(() => {
        // Skip events published by the client
        if (lastEvent && lastEvent.clientId !== clientId) {
            handleEvent(lastEvent);
        }
    }, [lastEvent]);
    return React.createElement(React.Fragment, null);
}
function EgressEventLoop({ id }) {
    const event = useRecoilValue(clusterEventEgressAtom);
    useEffect(() => {
        if (event && !allClusterEventKeys.includes(event.type)) {
            BackgroundEvents.dispatchEvent('eventSubscribe', id, { event });
        }
    }, [event]);
    return React.createElement(React.Fragment, null);
}
function EventStream(props) {
    const clusterState = useRecoilValue(clusterStateAtom);
    return clusterState === 'active' ? React.createElement(React.Fragment, null,
        React.createElement(Ingress, Object.assign({}, props)),
        React.createElement(Egress, Object.assign({}, props))) : React.createElement(React.Fragment, null);
}

function Cluster(props) {
    console.debug(`Cluster created: clusterId=${props.id}, clientId=${props.clientId}`);
    return React.createElement(RecoilRoot, { key: props.id },
        React.createElement(Clients, Object.assign({}, props)),
        React.createElement(Underlying, Object.assign({}, props)));
}
const closeTimeouts = {};
function Underlying(props) {
    const myClientState = useRecoilValue(myClientStateAtom);
    const [connected, setConnected] = useState(false);
    // Connect to the other cients of the cluster.
    useEffect(() => {
        if (!myClientState) {
            return;
        }
        if (myClientState.state === 'offline') {
            setConnected(false);
            closeTimeouts[props.id] = setTimeout(() => {
                delete closeTimeouts[props.id];
                props.rpc.close(props.id);
            }, 
            // Wait a moment until the socket becomes free.
            1000);
        }
        else if (myClientState.state === 'online') {
            const closeTimeout = closeTimeouts[props.id];
            if (closeTimeout) {
                clearTimeout(closeTimeout);
                delete closeTimeouts[props.id];
            }
            if (!connected) {
                props.rpc.connect(props.id).then(() => {
                    setConnected(true);
                }).catch(e => {
                    setConnected(false);
                    console.error('RPC connection error', e);
                    BackgroundEvents.dispatchEvent('backendError', props.id, {
                        message: "could not connect to the cluster.",
                        cause: e,
                    });
                });
            }
        }
    }, [myClientState]);
    return connected ? React.createElement(React.Fragment, null,
        React.createElement(EventStream, Object.assign({}, props)),
        React.createElement(CommitTerm, Object.assign({}, props)),
        React.createElement(TermCommittedEventHandler, Object.assign({}, props)),
        React.createElement(ClusterState, Object.assign({}, props)),
        React.createElement(HandleInitialEvents, Object.assign({}, props)),
        React.createElement(Initialize, Object.assign({}, props))) : React.createElement(React.Fragment, null);
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
function CommitTerm({ id, clientId, datastore, termDurationMillis = 3000 }) {
    const persistState = useRecoilCallback(({ set, snapshot }) => (force = false) => __awaiter(this, void 0, void 0, function* () {
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
                events[0] = Object.assign(Object.assign({}, termCreatedEvent), { type: 'termCreated' });
                delete events[0].volatile;
            }
            else {
                assert(events[0].type === 'termCreated', 'Invalid logs state');
            }
            assert(events.every(e => !e.volatile), `volatile event must not be stored. ${events}`);
            // Renumber the log id.
            const firstLogId = events[0].logId;
            const indexedEvents = events.map((v, i) => (Object.assign(Object.assign({}, v), { logId: firstLogId + i })));
            // Commit the logs.
            try {
                yield datastore.appendLogs(id, indexedEvents);
            }
            catch (e) {
                console.error(e);
                BackgroundEvents.dispatchEvent('backendError', id, {
                    message: "datastore#AppendLogs returns an error.",
                    unsavedEvents: indexedEvents,
                    cause: e,
                });
                return;
            }
            // When the logs is persisted, clear logs and setup the new term.
            const currentTermCreatedEvent = indexedEvents[0].data;
            const currentTerm = currentTermCreatedEvent.term;
            const newTerm = currentTerm + 1;
            const lastLogId = indexedEvents[indexedEvents.length - 1].logId;
            console.debug(`Committed the term: term=${currentTerm}, first logId=${firstLogId}, last logId=${lastLogId}`);
            const newTermCreatedEventData = {
                term: newTerm,
                createdAt: Date.now(),
            };
            set(typedClusterEventLogsAtom(), [{ type: 'termCreated', clientId, logId: lastLogId + 1, data: newTermCreatedEventData }]);
            // Notify the events has been stored for sure.
            set(typedClusterEventIngressAtom(), {
                type: 'termCommitted', volatile: true, data: {
                    term: currentTerm,
                    createdAt: newTermCreatedEventData.createdAt,
                    firstLogId,
                    lastLogId,
                }
            });
        }
    }), []);
    const events = useRecoilValue(eventLogsSelector);
    // Persist the state to the database every 3 seconds after the last change.
    useDebounceEffect(() => persistState(), termDurationMillis, [events]);
    // Check the state is consistent with the database for every 5 seconds.
    const timeout = termDurationMillis + 2000;
    useDebounceEffect(() => {
        // If the state is consistent, events becomes null.
        if (!events) {
            return;
        }
        if (events.length >= 1) {
            // events should be empty. If not, the state is inconsistent with the database. Forcibly persist the state.
            persistState(true);
        }
    }, timeout, [events]);
    // On offine, persist the state.
    useEffect(() => () => {
        persistState();
    }, []);
    return React.createElement(React.Fragment, null);
}
const termCommittedEventSelector = selector({
    key: 'termCommittedEventSelector',
    get: ({ get }) => {
        const event = get(typedClusterEventEgressAtom());
        return (event === null || event === void 0 ? void 0 : event.type) === 'termCommitted' ? event : null;
    },
});
function TermCommittedEventHandler({ id, clientId, datastore }) {
    const event = useRecoilValue(termCommittedEventSelector);
    const reconstructStateMachine = useRecoilCallback(({ set, snapshot }) => (id, syncFrom) => __awaiter(this, void 0, void 0, function* () {
        console.debug("reconstruct the state machine");
        let leaderLogs;
        try {
            leaderLogs = yield datastore.fetchLogs(id, syncFrom, -1);
        }
        catch (e) {
            console.error(e);
            BackgroundEvents.dispatchEvent('backendError', id, {
                message: "datastore#fetchLogs returns an error.",
                unsavedEvents: [],
                cause: e,
            });
            return;
        }
        assert(leaderLogs.length > 0);
        const myLogs = yield snapshot.getPromise(clusterInitialEventLogsAtom);
        const committed = syncFrom > 0 ? myLogs.slice(0, myLogs.findIndex(v => v.logId === syncFrom) - 1) : [];
        const newLogs = [...committed, ...leaderLogs];
        set(clusterInitialEventLogsAtom, newLogs);
    }), []);
    const handleTermCommittedEvent = useRecoilCallback(({ set, snapshot }) => (id, event) => __awaiter(this, void 0, void 0, function* () {
        if (event && event.clientId !== clientId) {
            const myLogs = yield snapshot.getPromise(clusterEventLogsAtom);
            const currentTermEvent = myLogs[0];
            assert(currentTermEvent);
            const myLastLogId = myLogs.length > 0 ? myLogs[myLogs.length - 1].logId : 0;
            if (currentTermEvent.data.term !== event.data.term) {
                console.warn(`The term doesn't match. my term=${currentTermEvent.data.term}, current term=${event.data.term}`);
                yield reconstructStateMachine(id, 0);
            }
            else if (myLastLogId < event.data.lastLogId) {
                console.warn(`The log id doesn't match. my logId=${myLastLogId}, current LogId=${event.data.lastLogId}.`);
                yield reconstructStateMachine(id, event.data.firstLogId);
            }
            else ;
            set(typedClusterEventLogsAtom(), [{
                    type: 'termCreated', clientId: event.clientId, logId: event.data.lastLogId + 1, data: {
                        term: event.data.term + 1,
                        createdAt: event.data.createdAt,
                    }
                }]);
        }
    }), []);
    useEffect(() => {
        handleTermCommittedEvent(id, event);
    }, [event]);
    return React.createElement(React.Fragment, null);
}
function ClusterState({ id }) {
    const state = useRecoilValue(clusterStateAtom);
    useEffect(() => {
        BackgroundEvents.dispatchEvent('state', id, { state });
    }, [state]);
    return React.createElement(React.Fragment, null);
}
function Initialize({ id, clientId, datastore }) {
    const [initialized, setInitialized] = React.useState(false);
    const constructStateMachine = useRecoilCallback(({ set }) => (id) => __awaiter(this, void 0, void 0, function* () {
        console.debug("construct the state machine");
        let leaderLogs;
        try {
            leaderLogs = yield datastore.fetchLogs(id, 0, -1);
        }
        catch (e) {
            console.error(e);
            BackgroundEvents.dispatchEvent('backendError', id, {
                message: "datastore#fetchLogs returns an error.",
                unsavedEvents: [],
                cause: e,
            });
            return;
        }
        if (leaderLogs.length > 0) {
            // Set the term marker. This will be ignored(removed) or replaced with the actual termCreated event once it's committed(if it's the leader client).
            const previousTermEvent = leaderLogs.slice().reverse().find(v => v.type === 'termCreated');
            assert(previousTermEvent);
            set(typedClusterEventLogsAtom(), [{
                    type: 'termporaryTermMarker', clientId, logId: leaderLogs[leaderLogs.length - 1].logId + 1, volatile: true,
                    data: {
                        term: previousTermEvent.data.term + 1,
                        createdAt: Date.now(),
                    },
                }]);
            set(clusterInitialEventLogsAtom, leaderLogs);
        }
        else {
            // This is the new cluster. Initialize the logs.
            const event = {
                type: 'termCreated', clientId, logId: 0,
                data: {
                    term: 0,
                    createdAt: Date.now(),
                },
            };
            set(typedClusterEventLogsAtom(), [event]);
            try {
                yield datastore.appendLogs(id, [event]);
            }
            catch (e) {
                BackgroundEvents.dispatchEvent('backendError', id, {
                    message: "datastore#appendLogs returns an error.",
                    unsavedEvents: [event],
                    cause: e,
                });
                return;
            }
        }
        set(clusterStateAtom, 'active');
    }), []);
    useEffect(() => {
        if (!initialized) {
            constructStateMachine(id).then(() => {
                setInitialized(true);
            });
            return;
        }
    }, [initialized]);
    return React.createElement(React.Fragment, null);
}
function HandleInitialEvents({ id }) {
    const logs = useRecoilValue(clusterInitialEventLogsAtom);
    useEffect(() => {
        BackgroundEvents.dispatchEvent('initialEvents', id, { logs });
    });
    return React.createElement(React.Fragment, null);
}

function useActiveClients(id) {
    const [activeClients, setActiveClients] = useState([]);
    useEffect(() => {
        BackgroundEvents.addEventListener('clientsChanged', id, e => {
            setActiveClients(e.activeClients);
        });
        return () => BackgroundEvents.removeEventListener('clientsChanged', id);
    }, []);
    return activeClients;
}

function useClusterState$1(id) {
    const [clusterState, setClusterState] = useState('loading');
    useEffect(() => {
        BackgroundEvents.addEventListener('state', id, e => {
            setClusterState(e.state);
        });
        return () => BackgroundEvents.removeEventListener('state', id);
    }, []);
    return clusterState;
}

function useClusterState(id) {
    const [clientState, setClientState] = useState({ primary: false, state: 'offline' });
    useEffect(() => {
        BackgroundEvents.addEventListener('clientStateChanged', id, e => {
            setClientState(e.client);
        });
        return () => BackgroundEvents.removeEventListener('clientStateChanged', id);
    }, []);
    return clientState;
}

function useEventPublisher(id) {
    const publishEvent = useCallback((event) => {
        BackgroundEvents.dispatchEvent('eventPublish', id, { event });
    }, [id]);
    return publishEvent;
}

function useEventSubscriber(id, filter) {
    const [event, setEvent] = useState(null);
    useEffect(() => {
        BackgroundEvents.addEventListener('eventSubscribe', id, e => {
            if (!filter || filter(e)) {
                setEvent(e.event);
            }
        });
        return () => BackgroundEvents.removeEventListener('eventSubscribe', id);
    }, []);
    return event;
}

function useInitialEvents(id) {
    const [initialEvents, setInitialEvents] = useState([]);
    useEffect(() => {
        BackgroundEvents.addEventListener('initialEvents', id, e => {
            setInitialEvents(e.logs);
        });
        return () => {
            BackgroundEvents.removeEventListener('initialEvents', id);
        };
    }, []);
    return initialEvents;
}

function useNotification(id) {
    const [info] = useState();
    const [warn, setWarn] = useState();
    useEffect(() => {
        BackgroundEvents.addEventListener('resyncRequired', id, e => {
            setWarn(Object.assign(Object.assign({}, e), { code: 1 }));
        });
        BackgroundEvents.addEventListener('backendError', id, e => {
            setWarn(Object.assign(Object.assign({}, e), { code: 2 }));
        });
        return () => {
            BackgroundEvents.removeEventListener('resyncRequired', id);
            BackgroundEvents.removeEventListener('backendError', id);
        };
    }, []);
    return [info, warn];
}

function useUndo(id) {
    const undo = useCallback(() => {
        BackgroundEvents.dispatchEvent('undo', id, { redo: false });
    }, []);
    const redo = useCallback(() => {
        BackgroundEvents.dispatchEvent('undo', id, { redo: true });
    }, []);
    return [undo, redo];
}

function useUndoHistory(id) {
    const [undoCount, setUndoCount] = useState(0);
    const [redoCount, setRedoCount] = useState(0);
    useEffect(() => {
        BackgroundEvents.addEventListener('undoHistoryChanged', id, e => {
            setUndoCount(e.undoCount);
            setRedoCount(e.redoCount);
        });
        return () => BackgroundEvents.removeEventListener('undoHistoryChanged', id);
    }, []);
    return [undoCount, redoCount];
}

function makeKeyNameForLog(clusterId) {
    return `log-${clusterId}`;
}
class WebdisDatastoreClient {
    constructor(host, port, options = {}) {
        this.host = host;
        this.port = port;
        this.makeKeyNameForLog = options.keyNameForLog || makeKeyNameForLog;
        this.ssl = options.ssl !== false;
    }
    appendLogs(clusterId, events) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield (yield fetch(`${this.ssl ? 'https' : 'http'}://${this.host}:${this.port}`, {
                method: 'POST',
                body: `rpush/${this.makeKeyNameForLog(clusterId)}/${events.map(e => encodeURIComponent(JSON.stringify(e))).join('/')}`,
            })).json();
            const persistedId = response.rpush;
            assert(persistedId);
        });
    }
    fetchLogs(clusterId, startAt, endAt) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield (yield fetch(`${this.ssl ? 'https' : 'http'}://${this.host}:${this.port}/lrange/${this.makeKeyNameForLog(clusterId)}/0/-1`)).json();
            if (data.lrange.length === 0) {
                return [];
            }
            // Restore the cluster logs
            const logIdsMemo = {};
            const events = data.lrange.map(v => {
                try {
                    return JSON.parse(decodeURIComponent(v) || 'null');
                }
                catch (e) {
                    console.warn('could not parse the event:', v, e);
                    return null;
                }
            })
                .filter((e) => e !== null)
                .filter((e) => {
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
        });
    }
}

class WebdisRpcClient {
    constructor(host, port, options = {}) {
        this.host = host;
        this.port = port;
        this.socketsIngress = {};
        this.socketsEgress = {};
        this.callbacksEgress = {};
        this.ssl = options.ssl !== false;
        this.pingIntervalSec = options.pingIntervalSec || 55;
    }
    connect(clusterId, nRetry = 1) {
        var _a, _b;
        let promise1 = null;
        {
            const existingSocketIngress = (_a = this.socketsIngress[clusterId]) === null || _a === void 0 ? void 0 : _a.socket;
            if (!existingSocketIngress || existingSocketIngress.readyState === WebSocket.CLOSING || existingSocketIngress.readyState === WebSocket.CLOSED) {
                if (existingSocketIngress) {
                    this.closeSocketIngress(clusterId);
                }
                this.socketsIngress[clusterId] = { socket: new WebSocket(`${this.ssl ? 'wss' : 'ws'}://${this.host}:${this.port}/.json?ingress=${clusterId}`) };
                promise1 = new Promise((resolve, reject) => {
                    this.socketsIngress[clusterId].socket.onopen = () => {
                        resolve();
                    };
                    this.socketsIngress[clusterId].socket.onerror = e => {
                        var _a;
                        (_a = this.socketsIngress[clusterId]) === null || _a === void 0 ? void 0 : _a.socket.close(3000, e ? `${e}` : 'unknown error');
                        reject(e);
                    };
                    this.socketsIngress[clusterId].socket.onclose = e => {
                        if (e) {
                            console.warn(`Socket is unexpectedly closed. Reconnect will be attempted in ${1000 * nRetry} millis.`, e.reason);
                            setTimeout(() => {
                                this.connect(clusterId, nRetry + 1);
                            }, 1000 * nRetry);
                        }
                    };
                }).then(() => {
                    // ping
                    clearInterval(this.socketsIngress[clusterId].pingTimer);
                    const t = setInterval(() => {
                        var _a;
                        const socket = (_a = this.socketsIngress[clusterId]) === null || _a === void 0 ? void 0 : _a.socket;
                        if (!socket || socket.readyState !== WebSocket.OPEN) {
                            return;
                        }
                        socket.send(JSON.stringify(['publish', clusterId, 'tick']));
                    }, this.pingIntervalSec * 1000);
                    this.socketsIngress[clusterId].pingTimer = t;
                });
            }
        }
        let promise2 = null;
        {
            const existingSocketEgress = (_b = this.socketsEgress[clusterId]) === null || _b === void 0 ? void 0 : _b.socket;
            if (!existingSocketEgress || existingSocketEgress.readyState === WebSocket.CLOSING || existingSocketEgress.readyState === WebSocket.CLOSED) {
                if (existingSocketEgress) {
                    this.closeSocketEgress(clusterId);
                }
                this.socketsEgress[clusterId] = { socket: new WebSocket(`${this.ssl ? 'wss' : 'ws'}://${this.host}:${this.port}/.json?egress=${clusterId}`), isSubscribed: false };
                promise2 = new Promise((resolve, reject) => {
                    this.socketsEgress[clusterId].socket.onopen = () => {
                        if (this.callbacksEgress[clusterId]) {
                            this.callbacksEgress[clusterId].forEach(callback => {
                                this.subscribeLog(clusterId, callback);
                            });
                        }
                        resolve();
                    };
                    this.socketsEgress[clusterId].socket.onerror = e => {
                        var _a;
                        (_a = this.socketsEgress[clusterId]) === null || _a === void 0 ? void 0 : _a.socket.close(3000, e ? `${e}` : 'unknown error');
                        reject(e);
                    };
                    this.socketsEgress[clusterId].socket.onclose = e => {
                        if (e) {
                            console.warn(`Socket is unexpectedly closed. Reconnect will be attempted in ${1000 * nRetry} millis.`, e.reason);
                            setTimeout(() => {
                                this.connect(clusterId, nRetry + 1);
                            }, 1000 * nRetry);
                        }
                    };
                });
            }
        }
        return Promise.all([promise1, promise2].filter(v => !!v));
    }
    closeSocketIngress(clusterId) {
        const socket = this.socketsIngress[clusterId];
        try {
            socket.socket.close();
            console.debug("ingress socket closed successfully");
        }
        catch (e) {
            console.error("could not close the ingress socket", e);
        }
        finally {
            delete this.socketsIngress[clusterId];
        }
    }
    closeSocketEgress(clusterId) {
        delete this.callbacksEgress[clusterId];
        const subscribeSocket = this.socketsEgress[clusterId];
        if (subscribeSocket) {
            try {
                subscribeSocket.socket.close();
                console.debug("subscribe socket closed successfully");
            }
            catch (e) {
                console.warn("could not close the subscribe socket", e);
            }
            finally {
                delete this.socketsEgress[clusterId];
            }
        }
    }
    close(clusterId) {
        this.closeSocketIngress(clusterId);
        this.closeSocketEgress(clusterId);
        return Promise.resolve();
    }
    broadcastLog(clusterId, event) {
        return __awaiter(this, void 0, void 0, function* () {
            const socket = this.socketsIngress[clusterId];
            if (!socket) {
                return Promise.reject(new Error('Call connect first'));
            }
            const promise = new Promise((resolve, reject) => {
                try {
                    if (socket.socket.readyState !== WebSocket.OPEN) {
                        return reject(new Error('Socket is not open'));
                    }
                    socket.socket.send(JSON.stringify(['publish', clusterId, encodeURIComponent(JSON.stringify(event))]));
                    resolve();
                }
                catch (e) {
                    reject(e);
                }
            });
            return promise;
        });
    }
    subscribeLog(clusterId, callback) {
        this.callbacksEgress[clusterId] = this.callbacksEgress[clusterId] || [];
        this.callbacksEgress[clusterId].push(callback);
        const subscribeSocket = this.socketsEgress[clusterId];
        if (!subscribeSocket) {
            return Promise.reject(new Error('Call connect first'));
        }
        if (!subscribeSocket.isSubscribed) {
            const promise = new Promise((resolve, reject) => {
                try {
                    if (subscribeSocket.socket.readyState !== WebSocket.OPEN) {
                        return reject(new Error('Socket is not open'));
                    }
                    subscribeSocket.isSubscribed = true;
                    subscribeSocket.socket.send(JSON.stringify(['subscribe', clusterId]));
                    subscribeSocket.socket.onmessage = (messageStr) => {
                        try {
                            const message = JSON.parse(messageStr.data || 'null');
                            if (message && message.subscribe && typeof message.subscribe !== 'number' && typeof message.subscribe[2] !== 'number') {
                                this.callbacksEgress[clusterId].forEach(callback => {
                                    const v = decodeURIComponent(message.subscribe[2]);
                                    if (v === 'tick') {
                                        // ignore
                                        return;
                                    }
                                    callback(JSON.parse(v));
                                });
                            }
                        }
                        catch (e) {
                            console.warn('Ignore the error', e);
                        }
                    };
                    resolve();
                }
                catch (e) {
                    reject(e);
                }
            });
            return promise;
        }
        else {
            return Promise.resolve();
        }
    }
}

export { WebdisDatastoreClient, WebdisRpcClient, Cluster as default, useActiveClients, useClusterState as useClientState, useClusterState$1 as useClusterState, useEventPublisher, useEventSubscriber, useInitialEvents, useNotification, useUndo, useUndoHistory };
//# sourceMappingURL=index.js.map
