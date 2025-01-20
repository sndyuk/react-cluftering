import { useState, useEffect } from 'react';
import { Client } from './internal/client';
import { BackgroundEvents } from './internal';

export default function useActiveClients(id: string) {
    const [activeClients, setActiveClients] = useState<Client[]>([]);

    useEffect(() => {
        BackgroundEvents.addEventListener('clientsChanged', id, (e) => {
            setActiveClients(e.activeClients);
        });
        return () => BackgroundEvents.removeEventListener('clientsChanged', id);
    }, []);

    return activeClients;
}
