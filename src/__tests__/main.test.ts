import { me } from 'src/main';

describe('test', () => {
    test('#1', async () => {
        expect(me.name).toBe('Luis');
    });
});
