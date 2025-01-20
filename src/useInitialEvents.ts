import { useEffect, useState } from 'react';
import { BackgroundEvents } from './internal';
import { AnyClusterEventLog } from './internal/state';

export default function useInitialEvents(id: string) {
    const [initialEvents, setInitialEvents] = useState<AnyClusterEventLog[]>([]);
    useEffect(() => {
        BackgroundEvents.addEventListener('initialEvents', id, (e) => {
            setInitialEvents(e.logs);
        });
        return () => {
            BackgroundEvents.removeEventListener('initialEvents', id);
        };
    }, []);
    return initialEvents;
}
