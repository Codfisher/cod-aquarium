/** 粗略判斷目前裝置是否以觸控為主要輸入（手機／平板）。
 * 用「主要指標裝置是否粗糙」當代理指標，比解析 UA 字串穩定，也不用額外套件。
 * 箱庭與各迷你遊戲的後製管線用它決定要不要降級渲染負載——
 * 手機 GPU／記憶體有限，超取樣＋高 MSAA＋SSAO 疊在一起容易在初始化時把 WebGL context 擠爆
 */
export function isCoarsePointerDevice(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches
}
