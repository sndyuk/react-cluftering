import { AnyClusterEventEgress } from "./internal/state";
import { TypedEventSubscribeEvent } from "./internal/internalEvents";
export default function useEventSubscriber<T extends AnyClusterEventEgress>(id: string, filter?: (data: TypedEventSubscribeEvent<T>) => boolean): T | null;
