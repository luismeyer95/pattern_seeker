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

const patternSeek = new PatternSeeker({
    stages: [
        { evaluator: equals(10) },
        { evaluator: isIncr, breakCounter: 3 },
        { evaluator: isIncr, breakCounter: 3 }
    ],
    lookbackBufferSize: 10
});
const dataset = [5, 6, 10, 11, 12, 3, 4, 5];

const expectedFinalReport = [
    { stage: 0, index: 2, value: 10 },
    { stage: 1, index: 3, value: 11 },
    { stage: 2, index: 4, value: 12 }
];

for (let i = 0; i < 3; ++i) {
    patternSeek.on(`${i}:complete`, (report) => {
        console.log(`${i}.\n`, report);
    });
}

dataset.forEach((el) => patternSeek.process(el));
