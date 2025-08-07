import { generateKeyBetween as insert } from 'fractional-indexing-jittered'

/**
 * 建立一個管理資料順序的物件，內部使用 Map 儲存資料，排序使用 fractional-indexing-jittered。
 */
export function createOrderedDataManager<K, V>() {
  const order: string[] = []
  const data: Map<string, { key: K; value: V }> = new Map()

  function create() {
    // 產生一個新的 key，保證唯一且排序正確
    // 用最小字串 '' 與最大字串 null 產生
    return insert('', null)
  }

  function sortOrder() {
    order.sort()
  }

  /** 新增資料到指定位置（預設加到最後） */
  function add(key: K, value: V, afterId?: string) {
    let idx: string
    if (order.length === 0) {
      idx = create()
    }
    else if (afterId) {
      const pos = order.indexOf(afterId)
      if (pos === -1 || pos === order.length - 1) {
        const prev: string = order.length > 0 && order[order.length - 1] !== undefined ? order[order.length - 1] : ''
        idx = insert(prev, null)
      }
      else {
        const left: string = order[pos] !== undefined ? order[pos] : ''
        const right: string | null = order.length > pos + 1 && order[pos + 1] !== undefined ? order[pos + 1] as string : null
        idx = insert(left, right)
      }
    }
    else {
      const prev: string = order.length > 0 && order[order.length - 1] !== undefined ? order[order.length - 1] : ''
      idx = insert(prev, null)
    }
    order.push(idx)
    data.set(idx, { key, value })
    sortOrder()
    return idx
  }

  /** 移動資料到另一個位置 */
  function move(id: string, afterId?: string) {
    const idx = order.indexOf(id)
    if (idx === -1)
      return
    order.splice(idx, 1)
    let newIdx: string
    if (!afterId) {
      const prev: string = order.length > 0 && order[order.length - 1] !== undefined ? order[order.length - 1] : ''
      newIdx = insert(prev, null)
    }
    else {
      const pos = order.indexOf(afterId)
      if (pos === -1 || pos === order.length - 1) {
        const prev: string = order.length > 0 && order[order.length - 1] !== undefined ? order[order.length - 1] : ''
        newIdx = insert(prev, null)
      }
      else {
        const left: string = order[pos] !== undefined ? order[pos] : ''
        const right: string | null = order.length > pos + 1 && order[pos + 1] !== undefined ? order[pos + 1] as string : null
        newIdx = insert(left, right)
      }
    }
    order.push(newIdx)
    const item = data.get(id)
    if (item) {
      data.delete(id)
      data.set(newIdx, item)
    }
    sortOrder()
    return newIdx
  }

  /** 刪除資料 */
  function del(id: string) {
    data.delete(id)
    const idx = order.indexOf(id)
    if (idx !== -1)
      order.splice(idx, 1)
  }

  /** 取得所有資料（依順序） */
  function getAll(): Array<{ id: string; key: K; value: V }> {
    return order.map((id) => {
      const item = data.get(id)!
      return { id, key: item.key, value: item.value }
    })
  }

  return {
    add,
    move,
    delete: del,
    getAll,
  }
}
