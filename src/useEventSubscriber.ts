import { useEffect, useState } from 'react';
import { AnyClusterEventEgress } from './internal/state';
import { BackgroundEvents } from './internal';
import { TypedEventSubscribeEvent } from './internal/internalEvents';

export default function useEventSubscriber<T extends AnyClusterEventEgress>(id: string, filter?: (data: TypedEventSubscribeEvent<T>) => boolean) {
    const [event, setEvent] = useState<T | null>(null);
    useEffect(() => {
        BackgroundEvents.addEventListener('eventSubscribe', id, (e) => {
            if (!filter || filter(e as TypedEventSubscribeEvent<T>)) {
                setEvent(e.event as T);
            }
        });
        return () => BackgroundEvents.removeEventListener('eventSubscribe', id);
    }, []);
    return event;
}
