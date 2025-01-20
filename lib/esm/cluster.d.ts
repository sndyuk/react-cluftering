/// <reference types="react" />
import { Datastore } from "./datastore";
import { Rpc } from "./rpc";
type Props = {
    id: string;
    clientId: string;
    datastore: Datastore;
    rpc: Rpc;
    termDurationMillis?: number;
    metadata?: {
        [key: string]: string;
    };
};
export default function Cluster(props: Props): JSX.Element;
export {};
