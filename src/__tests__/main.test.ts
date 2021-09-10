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

import { ma } from 'moving-averages';

type Candle = {
    open: number;
    close: number;
    high: number;
    low: number;
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
            lookbackBufferSize: 10
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
            lookbackBufferSize: 10
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
        // Strategy
        // 1. close price > 20MA > 50MA (=trend)
        // * record the swing high from now on
        // 2. 20MA > close price > 50MA + break if 50MA is crossed by close price
        // 3. close price > previous swing high => entry

        // const csv = 'type,part\nunicorn,horn\nrainbow,pink';
        const datapath = path.resolve(__dirname, './btcusdt_minute.csv');
        const rawdata = fs.readFileSync(datapath, {
            encoding: 'utf8'
        });
        const dataset = (await csv(rawdata)).map((candle: any) => {
            const { open, high, low, close } = candle;
            return { open, high, low, close };
        });

        const patternSeek = new PatternSeeker<Candle>({
            stages: [{ evaluator: ({ value: candle }, actions) => {} }],
            lookbackBufferSize: 10
        });
    });
});
