import { Cli } from 'incur';
/** Normalizes persistent session failures for CLI output. */
export declare function sessionCommandError(error: unknown, fallbackCode: string): never;
declare const sessions: Cli.Cli<{
    list: {
        args: {};
        options: {
            account?: string | undefined;
            network?: "testnet" | "mainnet" | undefined;
        };
    };
} & {
    view: {
        args: {
            channelId: string;
        };
        options: {};
    };
} & {
    close: {
        args: {
            channelId?: string | undefined;
        };
        options: {
            all: boolean;
            yes: boolean;
            account?: string | undefined;
            header?: string[] | undefined;
            network?: "testnet" | "mainnet" | undefined;
            rpcUrl?: string | undefined;
            url?: string | undefined;
        };
    };
}, undefined, undefined, undefined>;
export default sessions;
//# sourceMappingURL=commands.d.ts.map