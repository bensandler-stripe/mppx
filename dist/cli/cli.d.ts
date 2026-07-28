import { Cli } from 'incur';
declare const cli: Cli.Cli<{
    [x: string]: {
        args: {
            url: string;
        };
        options: {
            confirm: boolean;
            session: string;
            silent: boolean;
            userAgent: string;
            verbose: number;
            account?: string | undefined;
            autoSwap?: boolean | undefined;
            config?: string | undefined;
            currency?: string | undefined;
            data?: string | undefined;
            fail?: boolean | undefined;
            header?: string[] | undefined;
            include?: boolean | undefined;
            insecure?: boolean | undefined;
            jsonBody?: string | undefined;
            location?: boolean | undefined;
            method?: string | undefined;
            methodOpt?: string[] | undefined;
            network?: "testnet" | "mainnet" | undefined;
            payWith?: string | undefined;
            rpcUrl?: string | undefined;
            slippage?: number | undefined;
        };
    };
}, undefined, undefined, undefined>;
export default cli;
//# sourceMappingURL=cli.d.ts.map