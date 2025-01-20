import { AnyClusterEvent } from './internal/state';
export default function useEventPublisher<T extends AnyClusterEvent>(id: string): (event: T) => void;
