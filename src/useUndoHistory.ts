import { useEffect, useState } from 'react';
import { BackgroundEvents } from './internal';

export default function useUndoHistory(id: string): [number, number] {
    const [undoCount, setUndoCount] = useState(0);
    const [redoCount, setRedoCount] = useState(0);
    useEffect(() => {
        BackgroundEvents.addEventListener('undoHistoryChanged', id, (e) => {
            setUndoCount(e.undoCount);
            setRedoCount(e.redoCount);
        });
        return () => BackgroundEvents.removeEventListener('undoHistoryChanged', id);
    }, []);
    return [undoCount, redoCount];
}
