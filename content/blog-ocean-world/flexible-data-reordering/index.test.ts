import { describe, expect, it } from 'vitest'
import { createDataManager } from './'

interface Data {
  name: string;
  value: number;
}

describe('createDataManager', () => {
  it('新增資料並取得所有資料', () => {
    const manager = createDataManager<Data>()
    manager.add({ name: 'a', value: 1 })
    manager.add({ name: 'b', value: 2 })

    const allData = manager.getAll()

    expect(allData).toHaveLength(2)
    expect(allData[0]?.name).toBe('a')
    expect(allData[1]?.name).toBe('b')
  })

  it('根據 id 刪除資料', () => {
    const manager = createDataManager<Data>()
    const aId = manager.add({ name: 'a', value: 1 })
    manager.add({ name: 'b', value: 2 })

    manager.delete(aId)

    const allData = manager.getAll()
    expect(allData).toHaveLength(1)
    expect(allData[0]?.name).toBe('b')
  })

  it('可以移動資料到指定資料之後', () => {
    const manager = createDataManager<Data>()
    const aId = manager.add({ name: 'a', value: 1 })
    const bId = manager.add({ name: 'b', value: 2 })
    const cId = manager.add({ name: 'c', value: 3 })

    manager.moveAfter(aId, cId)

    const allData = manager.getAll()
    expect(
      allData.map((d) => d.name),
    ).toEqual(['b', 'c', 'a'])
  })

  it('可以移動資料到指定資料之前', () => {
    const manager = createDataManager<Data>()
    const aId = manager.add({ name: 'a', value: 1 })
    const bId = manager.add({ name: 'b', value: 2 })
    const cId = manager.add({ name: 'c', value: 3 })

    manager.moveBefore(bId, aId)

    const allData = manager.getAll()
    expect(
      allData.map((d) => d.name),
    ).toEqual(['b', 'a', 'c'])
  })
})
