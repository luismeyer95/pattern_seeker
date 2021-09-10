import { EventEmitter } from 'events';
import { pipeWith } from 'pipe-ts';
import * as shortId from 'short-uuid';

export type Item<T> = {
    index: number;
    value: T;
};

export type StageEvaluator<T, G = any> = (
    element: Item<T>,
    actions: StageActions<T, G>
) => unknown;

export type StageActions<T, G = any> = {
    progress: () => void;
    set: (mutator: (old?: G) => G | undefined) => void;
    get: () => G | undefined;
    lookback: () => readonly Readonly<Item<T>>[];
    break: () => void;
};

export type Stage<T, G = any> = {
    evaluator: StageEvaluator<T, G>;
    breakCounter?: number;
};

export type PatternDescriptor<T, G = any> = {
    stages: Stage<T, G>[];
    initialStateData?: G;
    lookbackBufferSize: number;
};

type Funcs = [() => number, () => string, () => bigint];

type GenericFunction = (...args: any[]) => any;
type ArrayReturnTypes<Fns extends GenericFunction[]> = Fns extends [
    infer First,
    ...infer Rest
]
    ? [
          ReturnType<First extends GenericFunction ? First : () => never>,
          ...ArrayReturnTypes<Rest extends GenericFunction[] ? Rest : []>
      ]
    : [];
type O = ArrayReturnTypes<Funcs>;

// export type PatternDescriptor<T, Inds, G = any> = {
//     stages: Stage<T, G, ArrayReturnTypes<Inds>>[];
//     indicators: Inds;
//     initialStateData?: G;
//     lookbackBufferSize: number;
// };

export type GlobalIndicator<T, IndT> = (
    item: Item<T>,
    lookback: readonly Readonly<Item<T>>[]
) => IndT;

export enum Change {
    NONE,
    PROGRESS,
    BREAK
}

export type StageCompletion<T> = Item<T> & {
    stage: number;
};

export type ExecutionState<T, G = any> = {
    id: string;
    data?: G;
    nextMove: Change;
    currentStage: number;
    breakCounter: number;
    backtrace: StageCompletion<T>[];
};

export type StageEventNames = 'break' | 'stagnate' | 'complete';
export type StageEvents = `${number}:${StageEventNames}` | 'complete';

export type StageEventReport<T, G = any> = Pick<
    ExecutionState<T, G>,
    'id' | 'data' | 'backtrace'
>;

export class PatternSeeker<T, G> extends EventEmitter {
    private states: ExecutionState<T, G>[] = [];
    private pattern: PatternDescriptor<T, G>;
    private curIndex = 0;

    private lookbackBuffer: Item<T>[] = [];

    constructor(pattern: PatternDescriptor<T, G>) {
        super();
        if (pattern.lookbackBufferSize < 0)
            throw new Error('lookbackBuffer should be > 0');
        this.pattern = pattern;
    }

    private startingState(): ExecutionState<T, G> {
        return {
            id: shortId.generate().slice(0, 5),
            currentStage: 0,
            nextMove: Change.NONE,
            data: this.pattern.initialStateData,
            breakCounter: this.pattern.stages[0].breakCounter ?? -1,
            backtrace: []
        };
    }

    private generateActions(
        execState: ExecutionState<T, G>
    ): StageActions<T, G> {
        return {
            progress: () => void (execState.nextMove = Change.PROGRESS),
            set: (mutator) => (execState.data = mutator(execState.data)),
            get: () => execState.data,
            lookback: () => this.lookbackBuffer,
            break: () => void (execState.nextMove = Change.BREAK)
        };
    }

    private updateLookback(element: T) {
        this.lookbackBuffer.push({ index: this.curIndex, value: element });
        if (this.lookbackBuffer.length > this.pattern.lookbackBufferSize)
            this.lookbackBuffer.shift();
    }

    private breakPredicate = ({
        nextMove,
        breakCounter
    }: ExecutionState<T, G>) => nextMove === Change.BREAK || breakCounter === 0;

    private completePredicate = ({
        nextMove,
        currentStage
    }: ExecutionState<T, G>) =>
        nextMove === Change.PROGRESS &&
        currentStage === this.pattern.stages.length - 1;

    private generateReport({
        id,
        data,
        backtrace
    }: ExecutionState<T, G>): StageEventReport<T, G> {
        return {
            id,
            data,
            backtrace: [...backtrace]
        };
    }

    private filterBreakStates = (states: ExecutionState<T, G>[]) => {
        return states.filter((execState) => {
            if (this.breakPredicate(execState)) {
                const report = this.generateReport(execState);
                this.emit(`${execState.currentStage}:break`, report);
                return false;
            }
            return true;
        });
    };

    private reportAndFilterCompletedStates = (
        states: ExecutionState<T, G>[]
    ) => {
        return states.filter((execState) => {
            if (this.completePredicate(execState)) {
                const completion = this.generateStageCompletion(execState);
                execState.backtrace.push(completion);
                const report = this.generateReport(execState);
                this.emit(`${execState.currentStage}:complete`, report);
                if (execState.currentStage === this.pattern.stages.length - 1)
                    this.emit(`complete`, report);
                return false;
            }
            return true;
        });
    };

    private processKeptStates = (states: ExecutionState<T, G>[]) => {
        return states.map((execState) => {
            if (execState.nextMove === Change.PROGRESS)
                return this.progressState(execState);
            return this.stagnateState(execState);
        });
    };

    private resetNextChange(state: ExecutionState<T, G>) {
        return { ...state, nextMove: Change.NONE };
    }

    private progressState(
        execState: ExecutionState<T, G>
    ): ExecutionState<T, G> {
        const completion = this.generateStageCompletion(execState);
        execState.backtrace.push(completion);
        execState.currentStage++;
        execState.breakCounter =
            this.pattern.stages[execState.currentStage].breakCounter ?? -1;
        const report = this.generateReport(execState);
        this.emit(`${execState.currentStage - 1}:complete`, report);
        return execState;
    }

    private generateStageCompletion(
        execState: ExecutionState<T, G>
    ): StageCompletion<T> {
        const lastItem = this.lookbackBuffer[this.lookbackBuffer.length - 1];
        const backtraceElement: StageCompletion<T> = {
            stage: execState.currentStage,
            ...lastItem
        };
        return backtraceElement;
    }

    private stagnateState(
        execState: ExecutionState<T, G>
    ): ExecutionState<T, G> {
        const { breakCounter } = execState;
        execState.breakCounter = breakCounter == -1 ? -1 : breakCounter - 1;
        execState.nextMove = Change.NONE;
        return execState;
    }

    private processStates(
        states: ExecutionState<T, G>[]
    ): ExecutionState<T, G>[] {
        return pipeWith(
            states,
            (st) => this.filterBreakStates(st),
            (st) => this.reportAndFilterCompletedStates(st),
            (st) => this.processKeptStates(st)
        );
    }

    process(element: T): void {
        if (!this.states.find((st) => st.currentStage === 0))
            this.states.push(this.startingState());
        this.states = this.states.map((st) => this.resetNextChange(st));
        this.states.forEach((execState) => {
            const stage = this.pattern.stages[execState.currentStage];
            const actions = this.generateActions(execState);
            const item: Item<T> = { index: this.curIndex, value: element };
            stage.evaluator(item, actions);
        });
        // do not move next line around
        this.updateLookback(element);
        this.states = this.processStates(this.states);
        this.curIndex++;
    }

    on(event: StageEvents, fn: (report: StageEventReport<T, G>) => any): this {
        const nb = parseInt(event, 10);
        if (nb < 0 || nb >= this.pattern.stages.length)
            throw new Error('invalid stage number');
        super.on(event, fn);
        return this;
    }
}

export const basicEvaluator = <T, G = any>(
    pred: (el: T, i: number, previous?: T) => boolean
): StageEvaluator<T, G> => {
    return ({ index, value }, { progress, lookback }) => {
        const buffer = lookback();
        const prev = buffer[buffer.length - 1];
        pred(value, index, prev?.value) && progress();
    };
};
