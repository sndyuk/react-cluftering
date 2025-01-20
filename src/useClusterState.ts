import { useState, useEffect } from 'react';
import { BackgroundEvents } from './internal';
import { ClusterState } from './internal/state';

export default function useClusterState(id: string) {
    const [clusterState, setClusterState] = useState<ClusterState>('loading');

    useEffect(() => {
        BackgroundEvents.addEventListener('state', id, (e) => {
            setClusterState(e.state);
        });
        return () => BackgroundEvents.removeEventListener('state', id);
    }, []);

    return clusterState;
}
