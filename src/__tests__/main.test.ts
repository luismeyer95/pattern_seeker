import {
    PatternSeeker,
    StageEvaluator,
    PatternDescriptor,
    evaluatorFromPredicate
} from 'src/main';

describe('test', () => {
    const equals10: StageEvaluator<number> = ({ value }, { progress }) => {
        if (value === 10) {
            progress();
        }
    };

    const isIncrement: StageEvaluator<number> = (
        { value },
        { progress, lookback }
    ) => {
        const backbuffer = lookback();
        const { value: last } = backbuffer[backbuffer.length - 1];
        if (last + 1 === value) {
            progress();
        }
    };

    const isInferiorTo8 = evaluatorFromPredicate((x: number) => x > 8);

    test('#1', () => {
        const pattern: PatternDescriptor<number> = {
            stages: [
                { evaluator: equals10 },
                { evaluator: isIncrement, breakCounter: 3 },
                { evaluator: isIncrement, breakCounter: 3 }
            ],
            lookbackSize: 10
        };
        const patternSeek = new PatternSeeker(pattern);
        const dataset = [5, 6, 10, 11, 4, 12, 6, 5];
        let result: number;

        patternSeek.onMatch((index: number) => {
            result = index;
        });

        dataset.forEach((el) => patternSeek.process(el));
        expect(result).toEqual([2, 3, 5]);
    });
});
