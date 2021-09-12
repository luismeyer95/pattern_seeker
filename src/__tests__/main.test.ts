import {
    PatternSeeker,
    StageEvaluator,
    PatternDescriptor,
    basicEvaluator
} from 'src/PatternSeeker';
import { StageEventReport } from 'src/PatternSeeker';

import csv from 'neat-csv';
import fs from 'fs';
import path from 'path';
import { DeepReadonly } from 'ts-essentials';

import { ma } from 'moving-averages';

type Candle = {
    open: number;
    close: number;
    high: number;
    low: number;
    ma20?: number;
    ma50?: number;
};

describe('test', () => {
    const equals = (x: number) => basicEvaluator((el: number) => el === x);
    const isIncr = basicEvaluator(
        (el: number, i, prev) => !!prev && prev + 1 === el
    );
    const isDecr = basicEvaluator(
        (el: number, i, prev) => !!prev && prev - 1 === el
    );

    test('#1', () => {
        const patternSeek = new PatternSeeker({
            stages: [
                { evaluator: equals(10) },
                { evaluator: isIncr, breakCounter: 3 },
                { evaluator: isIncr, breakCounter: 3 }
            ],
            lookbackBufferSize: 10,
            initialStateData: null
        });
        const dataset = [5, 6, 10, 11, 12, 3, 4, 5];
        const emit = (patternSeek.emit = jest.fn(
            patternSeek.emit.bind(patternSeek)
        ));

        const expectedFinalReport = [
            { stage: 0, index: 2, value: 10 },
            { stage: 1, index: 3, value: 11 },
            { stage: 2, index: 4, value: 12 }
        ];
        dataset.forEach((el) => patternSeek.process(el));

        const calls = emit.mock.calls.slice();
        const lastCall = calls.pop();
        calls.forEach((call, index) => {
            const [event, report] = call;
            expect(event).toStrictEqual(index.toString() + ':complete');
            expect(report.backtrace).toStrictEqual(
                expectedFinalReport.slice(0, index + 1)
            );
        });
        const [event, report] = lastCall!;
        expect(event).toStrictEqual('complete');
        expect(report.backtrace).toStrictEqual(expectedFinalReport);
    });

    test('stage events with multiple advancing states', () => {
        const patternSeek = new PatternSeeker({
            stages: [
                { evaluator: equals(10) },
                { evaluator: isIncr, breakCounter: 3 },
                { evaluator: equals(10) },
                { evaluator: isIncr, breakCounter: 3 }
            ],
            lookbackBufferSize: 10,
            initialStateData: null
        });
        const dataset = [10, 11, 10, 11];
        const emit = (patternSeek.emit = jest.fn(
            patternSeek.emit.bind(patternSeek)
        ));

        dataset.forEach((el) => patternSeek.process(el));
        const calls = emit.mock.calls.filter(
            ([eventString]) => eventString === '1:complete'
        );
        expect(calls.length).toEqual(2);
        expect(calls[0][1].id).not.toEqual(calls[1][1].id);
    });

    test('advanced strategy', async () => {
        const datapath = path.resolve(__dirname, './btcusdt_minute.csv');
        const rawdata = fs.readFileSync(datapath, {
            encoding: 'utf8'
        });
        const dataset = (await csv(rawdata)).map((candle: any) => {
            const { open, high, low, close } = candle;
            return { open, high, low, close };
        });

        const computeMA = (period: number) => {
            const lookback: number[] = [];
            return (item: number) => {
                lookback.push(item);
                if (lookback.length === period) {
                    const ttl = lookback.reduce((acc, el) => acc + el, 0);
                    lookback.shift();
                    return ttl / period;
                }
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
                    evaluator: (
                        { value: { close, ma20, ma50 } },
                        { progress }
                    ) => {
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

        const emit = (patternSeek.emit = jest.fn(
            patternSeek.emit.bind(patternSeek)
        ));

        const [get20MA, get50MA] = [20, 50].map(computeMA);
        for (const candle of dataset) {
            // patternSeek.process({
            //     ...candle,
            //     ma20: get20MA(candle.close),
            //     ma50: get50MA(candle.close)
            // });
            const ma20 = get20MA(candle.close);
            console.log(candle.close, ' | ', ma20);
        }

        const calls = emit.mock.calls.slice();
        console.log(calls);
    });
});
