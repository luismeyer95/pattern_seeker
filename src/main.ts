import {
    PatternSeeker,
    Stage,
    StageEvaluator,
    StageActions,
    PatternDescriptor,
    basicEvaluator,
    StageEventReport
} from 'src/PatternSeeker';
export {
    PatternSeeker,
    Stage,
    StageEvaluator,
    StageActions,
    PatternDescriptor,
    basicEvaluator,
    StageEventReport
};

import csv from 'neat-csv';
import fs from 'fs';
import path from 'path';
import { DeepReadonly } from 'ts-essentials';
import { ma } from 'moving-averages';

import stringify from 'csv-stringify';
import { plot, Plot, stack } from 'nodeplotlib';

// (async () => {
//     const createFib = () => {
//         let index = 0;
//         return () =>
//             (function f(n: number): number {
//                 return n < 2 ? 1 : f(n - 1) + f(n - 2);
//             })(index++);
//     };

//     const times = (n: number) => (fn: (...args: any[]) => any) => {
//         for (const i of Array(n).keys()) fn();
//     };
//     // use it
//     const fib = createFib();
//     const print = (f: () => any) => () => console.log(f());

//     times(24)(print(fib));
// })();

// const randGen = async function* () {
//     while (true) {
//         await new Promise((res) => void setTimeout(res, 200));
//         yield Math.floor(Math.random() * 100);
//     }
// };

// const computeMA = function (period: number) {
//     const lookback: number[] = [];
//     return (item: number) => {
//         lookback.push(item);
//         if (lookback.length === period) {
//             const ttl = lookback.reduce((acc, el) => acc + el, 0);
//             lookback.shift();
//             return ttl / period;
//         }
//     };
// };

// (async () => {
//     const rand = randGen();
//     const ma20 = computeMA(3);

//     for await (const item of rand) {
//         console.log(`rand: ${item}`);
//         console.log(`ma20: ${ma20(item)}`);
//     }
// })();

// const toCSV = (data: any) =>
//     new Promise((res: (v: string) => void, rej) => {
//         const opts = {
//             header: true
//         };
//         stringify(data, opts, function (err, output) {
//             if (err instanceof Error) rej(err);
//             else res(output);
//         });
//     });

/////////////////////////////////////////////////////

type Candle = {
    open: number;
    close: number;
    high: number;
    low: number;
    ma20?: number;
    ma50?: number;
};

(async () => {
    const datapath = path.resolve(__dirname, './__tests__/btcusdt_minute.csv');
    const rawdata = fs.readFileSync(datapath, {
        encoding: 'utf8'
    });

    const numberify = (data: { [key: string]: any }) => {
        const keyvals = Object.entries(data);
        const remapped = keyvals.map(
            (kp) => ((kp[1] = parseInt(kp[1], 10)), kp)
        );
        return Object.fromEntries(remapped);
    };

    let dataset: Candle[] = (await csv(rawdata))
        .map((candle: any, index: number) => {
            const { open, high, low, close } = candle;
            return { open, high, low, close, index };
        })
        .map(numberify) as Candle[];

    const computeMA = (period: number) => {
        const lookback: number[] = [];
        return (item: number) => {
            lookback.push(item);
            if (lookback.length === period) {
                const ttl = lookback.reduce((acc, el) => acc + el, 0);
                lookback.shift();
                return ttl / period;
            } else return 0;
        };
    };

    // Strategy
    // 1. close price > 20MA > 50MA (=trend)
    // * record the swing high from now on
    // 2. 20MA > close price > 50MA + break if 50MA is crossed by close price
    // 3. close price > previous swing high => entry
    const opts: PatternDescriptor<Candle, { swingHigh: number }> = {
        lookbackBufferSize: 50,
        initialStateData: { swingHigh: 0 },
        stages: [
            {
                evaluator: ({ value: { close, ma20, ma50 } }, { progress }) => {
                    if (!ma20 || !ma50) return;
                    if (close > ma20 && ma20 > ma50) {
                        progress();
                    }
                }
            },
            {
                evaluator: ({ value: { close, ma20, ma50 } }, actions) => {
                    actions.set(({ swingHigh }) => ({
                        swingHigh: close > swingHigh ? close : swingHigh
                    }));
                    if (ma20! > close && close > ma50!) actions.progress();
                    if (close < ma50!) actions.break();
                }
            },
            {
                evaluator: ({ value: { close } }, actions) => {
                    const { swingHigh } = actions.get();
                    if (close > swingHigh) actions.progress();
                }
            }
        ]
    };
    const patternSeek = new PatternSeeker(opts);
    const completeReports: StageEventReport<Candle>[] = [];

    patternSeek.on('complete', (report) => {
        completeReports.push(report);
    });

    const [get20MA, get50MA] = [20, 50].map(computeMA);
    dataset = dataset.map((row) => ({
        ...row,
        ma20: get20MA(row.close),
        ma50: get50MA(row.close)
    }));

    for (const candle of dataset) {
        patternSeek.process(candle);
    }

    // console.log(completeReports);
    const plotBarOnRange = (len: number, arr: number[], barval = 50000) => {
        return Array<number>(len)
            .fill(0)
            .map((el, i) => {
                if (arr.find((entryIndex) => i === entryIndex)) return barval;
                return 0;
            });
    };

    // compute entrypoints
    const stageEventPlots = completeReports
        .map((rp) => rp.backtrace.map((stage) => stage.index))
        .map((el) => plotBarOnRange(dataset.length, el))
        .map((el) => ({
            x: dataset.map((row, i) => i),
            y: el,
            type: 'bar',
            name: 'Entries'
        })) as Plot[];

    console.log(stageEventPlots);

    // stack([]);

    plot([
        {
            x: dataset.map((row, i) => i),
            y: dataset.map((row) => row.close),
            name: 'price'
        },
        {
            x: dataset.map((row, i) => i),
            y: dataset.map((row) => row.ma20!),
            name: '20 MA'
        },
        {
            x: dataset.map((row, i) => i),
            y: dataset.map((row) => row.ma50!),
            name: '50 MA'
        },
        ...stageEventPlots
    ]);

    // const output = await toCSV(dataset);
    // const writepath = path.resolve(__dirname, './__tests__/sample.csv');
    // fs.writeFileSync(writepath, output);
})();

/////////////////////////////////////////
