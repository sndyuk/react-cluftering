import { useState, useEffect } from 'react';
import { BackgroundEvents } from './internal';
import { ClientState } from './internal/client';

export default function useClusterState(id: string) {
    const [clientState, setClientState] = useState<{ primary: boolean; state: ClientState }>({ primary: false, state: 'offline' });

    useEffect(() => {
        BackgroundEvents.addEventListener('clientStateChanged', id, (e) => {
            setClientState(e.client);
        });
        return () => BackgroundEvents.removeEventListener('clientStateChanged', id);
    }, []);

    return clientState;
}
