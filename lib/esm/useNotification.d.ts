import { AnyClusterEventLog } from './internal/state';
export type Message = {
    code: number;
    message: string;
    unsavedEvents?: AnyClusterEventLog[];
    cause?: Error;
};
export default function useNotification(id: string): (Message | null | undefined)[];
