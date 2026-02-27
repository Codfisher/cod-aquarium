/** 特性
 *
 * block 可有多個 trait，不同規模的 trait 會產生對應的 soundscape
 */
export enum TraitTypeEnum {
  GRASS = 'grass',
  TREE = 'tree',
  CAMPFIRE = 'campfire',
  BUILDING = 'building',
  ALPINE = 'alpine',
  RIVER = 'river',
  WATER = 'water',
  SAND = 'sand',
}
export type TraitType = `${TraitTypeEnum}`

export enum WeatherEnum {
  RAIN = 'rain',
}
export type Weather = `${WeatherEnum}`
