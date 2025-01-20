import { ClientState } from './internal/client';
export default function useClusterState(id: string): {
    primary: boolean;
    state: ClientState;
};
