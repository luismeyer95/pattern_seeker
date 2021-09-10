declare module 'moving-averages' {
    export function ma(
        data: (number | undefined)[],
        size
    ): (number | undefined)[];
}
