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

const equals = (x: number) => basicEvaluator((el: number) => el === x);
const isIncr = basicEvaluator(
    (el: number, i, prev) => !!prev && prev + 1 === el
);
const isDecr = basicEvaluator(
    (el: number, i, prev) => !!prev && prev - 1 === el
);

const patternSeek = new PatternSeeker<number>({
    stages: [
        {
            evaluator: (item, actions) => {
                console.log(actions.indicators());
            }
        }
    ],
    lookbackBufferSize: 10,
    indicators: {
        ma20: (item, lookback) => number
    }
});

patternSeek.process();
