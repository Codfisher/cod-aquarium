export type SoundscapeType = 'rustle' |
  'insect' |
  'bird' |
  'frog' |
  'beast' |
  'river' |
  'building' |
  'ocean' |
  'alpine'

interface Sound {
  src: string;
  /** 0 ~ 1 */
  volume?: number;
}

export interface Soundscape {
  id: number;
  type: SoundscapeType;
  mode: 'loop' | 'interval';
  soundList: Sound[];
}
