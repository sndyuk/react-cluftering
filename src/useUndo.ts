import { useCallback } from 'react';
import { BackgroundEvents } from './internal';

export default function useUndo(id: string): [() => void, () => void] {
    const undo = useCallback(() => {
        BackgroundEvents.dispatchEvent('undo', id, { redo: false });
    }, []);
    const redo = useCallback(() => {
        BackgroundEvents.dispatchEvent('undo', id, { redo: true });
    }, []);
    return [undo, redo];
}
