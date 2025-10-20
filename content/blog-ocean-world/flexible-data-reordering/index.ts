import { generateKeyBetween } from 'fractional-indexing-jittered'
import { nanoid } from 'nanoid'

export function createDataManager<Data>() {
  const dataMap: Map<string, {
    data: Data;
    order: string;
  }> = new Map()

  function getDataEntriesList() {
    return Array
      .from(dataMap)
      .sort((a, b) => a[1].order < b[1].order ? -1 : 1)
  }

  return {
    add(data: Data) {
      const id = nanoid()
      const lastData = getDataEntriesList().at(-1)

      const order = generateKeyBetween(
        lastData?.[1].order ?? null,
        null,
      )
      dataMap.set(id, { data, order })
      return id
    },
    moveBefore(
      id: string,
      targetId: string,
    ) {
      const currentData = dataMap.get(id)
      if (!currentData)
        return
      const targetData = dataMap.get(targetId)
      if (!targetData)
        return

      const dataList = getDataEntriesList()
      const targetIndex = dataList.findIndex((item) => item[0] === targetId)
      const prevTarget = dataList[targetIndex - 1]

      const newOrder = generateKeyBetween(
        prevTarget?.[1].order ?? null,
        targetData.order,
      )
      currentData.order = newOrder
      dataMap.set(id, currentData)
    },
    moveAfter(
      id: string,
      targetId: string,
    ) {
      const currentData = dataMap.get(id)
      if (!currentData)
        return
      const targetData = dataMap.get(targetId)
      if (!targetData)
        return

      const dataList = getDataEntriesList()
      const targetIndex = dataList.findIndex((item) => item[0] === targetId)
      const nextTarget = dataList[targetIndex + 1]

      const newOrder = generateKeyBetween(
        targetData.order,
        nextTarget?.[1].order ?? null,
      )
      currentData.order = newOrder
      dataMap.set(id, currentData)
    },
    delete(id: string) {
      dataMap.delete(id)
    },

    getAll() {
      console.log('')
      return getDataEntriesList()
        .map(([_, item]) => {
          console.log(item)
          return item.data
        })
    },
  }
}
