import { lastValueFrom, of } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { ResponseFormatInterceptor } from './response-format.interceptor.js';

function run<T>(value: T): Promise<unknown> {
  const interceptor = new ResponseFormatInterceptor();
  const executionContext = {} as ExecutionContext;
  const callHandler: CallHandler = {
    handle: () => of(value),
  };
  return lastValueFrom(interceptor.intercept(executionContext, callHandler));
}

describe('ResponseFormatInterceptor', () => {
  it('wraps a payload in the data envelope', async () => {
    await expect(run({ id: 1, name: 'apple' })).resolves.toEqual({
      data: { id: 1, name: 'apple' },
      meta: {},
    });
  });

  it('passes through an array payload', async () => {
    await expect(run([1, 2, 3])).resolves.toEqual({
      data: [1, 2, 3],
      meta: {},
    });
  });

  it('normalizes an undefined payload to null data', async () => {
    await expect(run(undefined)).resolves.toEqual({
      data: null,
      meta: {},
    });
  });
});
