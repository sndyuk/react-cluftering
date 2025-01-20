/// <reference types="react" />
import { Rpc } from "../../rpc";
type Props = {
    id: string;
    clientId: string;
    rpc: Rpc;
};
export default function EventStream(props: Props): JSX.Element;
export {};
