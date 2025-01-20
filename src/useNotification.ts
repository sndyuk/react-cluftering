import { useState, useEffect } from 'react';
import { BackgroundEvents } from './internal';
import { AnyClusterEventLog } from './internal/state';

export type Message = {
    code: number;
    message: string;
    unsavedEvents?: AnyClusterEventLog[];
    cause?: Error;
};

export default function useNotification(id: string) {
    const [info] = useState<Message | null>();
    const [warn, setWarn] = useState<Message | null>();

    useEffect(() => {
        BackgroundEvents.addEventListener('resyncRequired', id, (e) => {
            setWarn({
                ...e,
                code: 1,
            });
        });
        BackgroundEvents.addEventListener('backendError', id, (e) => {
            setWarn({
                ...e,
                code: 2,
            });
        });

        return () => {
            BackgroundEvents.removeEventListener('resyncRequired', id);
            BackgroundEvents.removeEventListener('backendError', id);
        };
    }, []);

    return [info, warn];
}
