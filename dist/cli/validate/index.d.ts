import { Cli } from 'incur';
declare const validate: Cli.Cli<{
    [x: string]: {
        args: {
            url: string;
        };
        options: {
            verbose: number;
            yes: boolean;
            outputJson: boolean;
            endpoint?: string | undefined;
            body?: string | undefined;
            query?: string[] | undefined;
            header?: string[] | undefined;
        };
    };
}, undefined, undefined, undefined>;
export default validate;
//# sourceMappingURL=index.d.ts.map