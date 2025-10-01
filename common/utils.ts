/** 確保瀏覽器 layout/paint 完成 */
export async function nextFrame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}
