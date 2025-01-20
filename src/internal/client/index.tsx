import assert from 'assert';
import React, { useCallback, useEffect } from 'react';
import { selector, useRecoilCallback, useRecoilValue } from 'recoil';
import { BackgroundEvents } from '..';
import { activeClusterClientsAtom, ClusterEventEgress, MemberModifiedEventData, myClientStateAtom, typedClusterEventEgressAtom, typedClusterEventIngressAtom } from '../state';

export type ClientState = 'online' | 'offline' | 'inconsistent';

export type Client = {
    id: string;
    state: ClientState;
    primary: boolean;
    nonce: number;
    metadata?: { [key: string]: string };
};

type Props = {
    id: string;
    clientId: string;
    metadata?: { [key: string]: string };
};

export default function Clients(props: Props) {
    console.debug('Client created');
    return (
        <>
            <Other {...props} />
            <Myself {...props} />
            <ActiveClients {...props} />
            <ClientState {...props} />
        </>
    );
}

const memberModifiedEventSelector = selector({
    key: 'clientEventSelector',
    get: ({ get }) => {
        const event = get(typedClusterEventEgressAtom<'memberModified'>());
        return event?.type === 'memberModified' ? event : null;
    },
});

function electPrimary(a: Client, b: Client) {
    if (a.nonce < b.nonce) {
        return a;
    }
    if (a.nonce > b.nonce) {
        return b;
    }
    return a.id < b.id ? a : b;
}

function Other({ clientId, id }: Props) {
    const handleOtherClientEvent = useRecoilCallback(
        ({ set, snapshot }) =>
            (event: ClusterEventEgress<MemberModifiedEventData>) => {
                console.debug(`cluster[${id}]: Client event received`, event);
                const activeClients = snapshot.getLoadable(activeClusterClientsAtom).getValue();
                const otherClient = { ...event.data, id: event.clientId, broadcast: false };

                let newActiveClients: Client[];
                if (otherClient.state === 'online') {
                    if (!activeClients.some((v) => v.id === otherClient.id)) {
                        // New client has joined.
                        newActiveClients = [...activeClients, otherClient];
                    } else {
                        newActiveClients = activeClients;
                    }
                } else {
                    // Remove from activeClients
                    newActiveClients = activeClients.filter((c) => c.id !== otherClient.id);
                }
                // reset the primary flag
                const primaryClient = newActiveClients.reduce(electPrimary);
                newActiveClients = newActiveClients.map((c) => ({ ...c, primary: c.id === primaryClient.id }));
                set(activeClusterClientsAtom, newActiveClients);

                // When the client is active, notify the status to other clients.
                const me = newActiveClients.find((c) => c.id === clientId);
                set(myClientStateAtom, me);
                if (me && !event.data.broadcast) {
                    set(typedClusterEventIngressAtom<'memberModified'>(), { type: 'memberModified', volatile: true, data: { ...me, broadcast: true } });
                }
            },
        []
    );

    // on handle other client event
    const otherClientEvent = useRecoilValue(memberModifiedEventSelector);
    useEffect(() => {
        if (!otherClientEvent) {
            return;
        }
        handleOtherClientEvent(otherClientEvent);
    }, [otherClientEvent]);

    return <></>;
}

// The static random number for the client which is used for electing the primary client.
const MY_NONCE = Number(`${Math.random()}`.replace('.', ''));

function Myself({ clientId, id, metadata }: Props) {
    const ensurePrimaryClient = useRecoilCallback(
        ({ set, snapshot }) =>
            () => {
                const clients = snapshot.getLoadable(activeClusterClientsAtom).getValue();
                const primaryClient = clients.find((v) => v.primary);
                if (primaryClient) {
                    return;
                }
                // If no one is primary, make me primary.
                const me = snapshot.getLoadable(myClientStateAtom).getValue();
                assert(me);
                if (me.state !== 'online') {
                    return;
                }
                const client = { ...me, primary: true };
                set(myClientStateAtom, client);
                set(activeClusterClientsAtom, [me, ...clients.filter((v) => v.id !== me.id)]);
                set(typedClusterEventIngressAtom<'memberModified'>(), { type: 'memberModified', volatile: true, data: { ...client, broadcast: false } });
            },
        []
    );

    const onChangeClientState = useRecoilCallback(
        ({ set, snapshot }) =>
            (clientState: ClientState) => {
                const clients = snapshot.getLoadable(activeClusterClientsAtom).getValue();
                const me = snapshot.getLoadable(myClientStateAtom).getValue();

                if (clientState === 'online') {
                    if (me?.state === 'online') {
                        // The client is already online.
                        return;
                    }
                    // The client becomes online.
                    console.debug('online');
                    const client: Client = { id: clientId, state: 'online', primary: false, nonce: me ? me.nonce : MY_NONCE, metadata };
                    set(myClientStateAtom, client);
                    // Clear the active clients.
                    set(activeClusterClientsAtom, [client]);
                    // This will trigger bradcasting from other online clients.
                    set(typedClusterEventIngressAtom<'memberModified'>(), { type: 'memberModified', volatile: true, data: { ...client, broadcast: false } });
                    // Wait for other client responses. If not received, set myself as a primary.
                    setTimeout(ensurePrimaryClient, 800);
                } else if (clientState === 'offline') {
                    if (!me || me.state === 'offline') {
                        // The client is not initiated yet or already offline.
                        return;
                    }
                    // The client becomes offine.
                    console.debug('offline');
                    const client: Client = { ...me, state: 'offline' };
                    set(myClientStateAtom, client);
                    set(
                        activeClusterClientsAtom,
                        clients.filter((c) => c.id !== clientId)
                    );
                    set(typedClusterEventIngressAtom<'memberModified'>(), { type: 'memberModified', volatile: true, data: { ...client, broadcast: false } });
                } else if (clientState === 'inconsistent') {
                    if (me?.state === 'offline' || me?.state === 'inconsistent') {
                        // The client is offline or already inconsistent.
                        return;
                    }
                    // The client state becomes inconsistent.
                    console.debug('inconsistent');
                    const client: Client = { id: clientId, state: 'online', primary: false, nonce: me ? me.nonce : MY_NONCE, metadata };
                    set(activeClusterClientsAtom, [client]);
                    set(typedClusterEventIngressAtom<'memberModified'>(), { type: 'memberModified', volatile: true, data: { ...client, broadcast: false } });
                }
            },
        []
    );

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
    useEffect(
        () => () => {
            onChangeClientState('offline');
            BackgroundEvents.removeEventListener('electionRequired', id);
            window.removeEventListener('visibilitychange', onVisibilitychange);
        },
        []
    );
    return <></>;
}

function ActiveClients({ id }: Props) {
    const activeClients = useRecoilValue(activeClusterClientsAtom);
    useEffect(() => {
        BackgroundEvents.dispatchEvent('clientsChanged', id, { activeClients });
    }, [activeClients]);
    return <></>;
}

function ClientState({ id }: Props) {
    const client = useRecoilValue(myClientStateAtom);
    useEffect(() => {
        // Null means the client is not initiated yet.
        if (client) {
            BackgroundEvents.dispatchEvent('clientStateChanged', id, { client });
        }
    }, [client]);
    return <></>;
}
