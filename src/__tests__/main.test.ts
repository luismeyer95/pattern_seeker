import {
    PatternSeeker,
    StageEvaluator,
    PatternDescriptor,
    basicEvaluator
} from 'src/PatternSeeker';
import { StageEventReport } from 'src/PatternSeeker';

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
        const emitCalls = emit.mock.calls;
        const expectedFinalReport = [
            { stage: 0, index: 2, value: 10 },
            { stage: 1, index: 3, value: 11 },
            { stage: 2, index: 4, value: 12 }
        ];
        dataset.forEach((el) => patternSeek.process(el));
        emitCalls.slice(0, 3).forEach((call, index) => {
            const [event, report] = call;
            expect(event).toStrictEqual(index.toString() + ':complete');
            expect(report.backtrace).toStrictEqual(
                expectedFinalReport.slice(0, index + 1)
            );
        });
    });

    test('#2', () => {
        const obj: any = { nested: { age: 26 }, name: 'luis' };
        expect({ nested: { age: 26 }, name: 'luis' }).toEqual(obj);
    });
});
