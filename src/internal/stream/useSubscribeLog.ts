import { useEffect, useState } from 'react';
import { Rpc } from '../../rpc';
import { AnyClusterEventEgress } from '../state';

export default function useSubscribeLog(id: string, rpc: Rpc) {
    const [event, setEvent] = useState<AnyClusterEventEgress | null>(null);
    useEffect(() => {
        rpc.subscribeLog(id, (event: AnyClusterEventEgress) => {
            setEvent(event);
        });
    }, []);
    return event;
}
