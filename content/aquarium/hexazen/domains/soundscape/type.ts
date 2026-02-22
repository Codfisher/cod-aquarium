export type SoundscapeType = 'rustle' |
  'insect' |
  'bird' |
  'frog' |
  'beast' |
  'river'

interface Sound {
  src: string;
  /** 0 ~ 1 */
  volume?: number;
}

export interface Soundscape {
  type: SoundscapeType;
  mode: 'loop' | 'interval';
  soundList: Sound[];
}
