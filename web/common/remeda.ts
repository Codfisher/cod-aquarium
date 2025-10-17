/** 協助處理 remeda pipe 中的 promise
 *
 * @example
 * // 原本每一個 async 後都要先 await 才能拿到 data
 * ```typescript
 * pipe(
 *   'data',
 *   async (data) => data,
 *   async (promise) => {
 *     const data = await promise;
 *   },
 * );
 *
 * // 用此 function 包裝一下就不用了
 * pipe(
 *   'data',
 *   async (data) => data,
 *   then(async (data) => { }),
 * );
 * ```
 */
export function then<FnInput, Result>(
  fn: (a: FnInput) => Result | Promise<Result>,
): (a: FnInput | Promise<FnInput>) => Promise<Awaited<Result>>
export function then<FnInput, Result>(
  fn: (a: FnInput) => Result | Promise<Result>,
) {
  return async (a: FnInput | Promise<FnInput>): Promise<Awaited<Result>> => {
    return fn(await a) as Awaited<Result>
  }
}
