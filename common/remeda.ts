/** 協助處理 remeda pipe 中的 promise
 *
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
 * // 用 then 包裝一下就不用了
 * pipe(
 *   'data',
 *   async (data) => data,
 *   then(async (data) => { }),
 * );
 * ```
 */
export function then<Fn, Result>(
  fn: (a: Fn extends Promise<infer S> ? S : Fn) => Result | Promise<Result>,
): (a: Fn) => Promise<Result> {
  return async (a: Fn) => {
    return (fn as any)(await a)
  }
}
