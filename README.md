# React Cluftering
The muti clients cluster that drives upon Raft consensus algorithm.

## Example
```ts
// clientId should be generated by the backend (e.g. userId + terminalId)
const clientId = Math.random().toString().replace('.', '');

export type Props = {
    id: string,
};

export default function Whiteboard({ id }: Props) {
    console.debug("Whiteboard created");
    return <>
        <Cluster clientId={clientId} id={id} />
        ...
    </>
}

```


```ts
import React, { useEffect } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { AnyClusterEvent, AnyClusterEventEgress, useClusterState, useEventPublisher, useEventSubscriber } from "react-cluftering";

type Props = {
  clientId: string,
  clusterId: string,
}

export default function EventStream(props: Props) {
  const clusterState = useClusterState(props.clusterId);
  return clusterState === 'active' ? <>
    <Ingress {...props} />
    <Egress {...props} />
  </> : <></>;
}

function Ingress({ clusterId }: Props) {
  const publishEvent = useEventPublisher(clusterId);
  const event = useRecoilValue(applicationEventIngressAtomFamily(id));
  useEffect(() => { event && publishEvent(event) }, [event]);
  return <></>
}

function Egress({ id }: Props) {
  const event = useEventSubscriber(id);
  const callback = useRecoilCallback(({ set }) => async (event: AnyClusterEventEgress) => {
    // Do with the event. e.g. Trigger event handlers.
    ...
  }, []);
  useEffect(() => event && callback(event), [event]);
  return <></>
}
```