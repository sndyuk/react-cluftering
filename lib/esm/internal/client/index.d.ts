/// <reference types="react" />
export type ClientState = 'online' | 'offline' | 'inconsistent';
export type Client = {
    id: string;
    state: ClientState;
    primary: boolean;
    nonce: number;
    metadata?: {
        [key: string]: string;
    };
};
type Props = {
    id: string;
    clientId: string;
    metadata?: {
        [key: string]: string;
    };
};
export default function Clients(props: Props): JSX.Element;
export {};
