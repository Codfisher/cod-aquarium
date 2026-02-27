export type SoundscapeType = 'rustle' |
  'insect' |
  'bird' |
  'frog' |
  'beast' |
  'river' |
  'building' |
  'ocean' |
  'alpine' |
  'rain' |
  'campfire'

interface Sound {
  src: string;
  /** 0 ~ 1
   *
   * @default 0.5
   */
  volume?: number;
}

export interface Soundscape {
  id: number;
  type: SoundscapeType;
  mode: {
    value: 'loop';
  } | {
    value: 'interval';
    /** @default [5, 10] 秒 */
    range?: [number, number];
  };
  soundList: Sound[];
}
