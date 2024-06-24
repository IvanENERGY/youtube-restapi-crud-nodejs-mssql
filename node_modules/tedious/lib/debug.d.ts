/// <reference types="node" />
import { EventEmitter } from 'events';
import { Packet } from './packet';
declare class Debug extends EventEmitter {
    options: {
        data: boolean;
        payload: boolean;
        packet: boolean;
        token: boolean;
    };
    indent: string;
    constructor({ data, payload, packet, token }?: {
        data?: boolean | undefined;
        payload?: boolean | undefined;
        packet?: boolean | undefined;
        token?: boolean | undefined;
    });
    packet(direction: 'Received' | 'Sent', packet: Packet): void;
    data(packet: Packet): void;
    payload(generatePayloadText: () => string): void;
    token(token: any): void;
    haveListeners(): boolean;
    log(text: string): void;
}
export default Debug;
