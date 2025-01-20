import { useCallback } from 'react';
import { BackgroundEvents } from './internal';
import { AnyClusterEvent } from './internal/state';

export default function useEventPublisher<T extends AnyClusterEvent>(id: string) {
    const publishEvent = useCallback(
        (event: T) => {
            BackgroundEvents.dispatchEvent('eventPublish', id, { event });
        },
        [id]
    );
    return publishEvent;
}
