export interface BeybladeStats {
  /** 碰撞擊飛力 */
  attack: number;
  /** 抵抗擊飛的能力 */
  defense: number;
  /** 轉速衰減率（越高衰減越慢） */
  stamina: number;
  /** 移動速率 */
  speed: number;
  /** 爆擊率（0~10，每點 = 3% 機率） */
  critical: number;
}

export interface BeybladeState {
  /** 場地上的 2D 位置 */
  position: { x: number; y: number };
  /** 速度向量 */
  velocity: { x: number; y: number };
  /** 當前轉速（RPM），0 = 停止 */
  spinRate: number;
  /** 當前旋轉角度（視覺用） */
  rotationAngle: number;
}

export enum BattlePhase {
  CONFIGURE = 'CONFIGURE',
  QTE_CHARGE = 'QTE_CHARGE',
  QTE_AIM = 'QTE_AIM',
  QTE_LAUNCH = 'QTE_LAUNCH',
  BATTLE = 'BATTLE',
  RESULT = 'RESULT',
}

export type BattleResult = 'win' | 'lose' | 'draw'

export type Difficulty = 'easy' | 'medium' | 'hard'

export enum PartCategory {
  ATTACK_RING = 'attackRing',
  WEIGHT_DISK = 'weightDisk',
  SPIN_TIP = 'spinTip',
}

export interface PartDefinition {
  id: string;
  name: {
    'zh-hant': string;
    'en': string;
  };
  category: PartCategory;
  statsModifier: Partial<BeybladeStats>;
  /** 攻擊環的碰撞半徑 */
  collisionRadius?: number;
  /** 軸心的摩擦係數 */
  frictionCoefficient?: number;
  /** 程式化建模參數 */
  visualParams: Record<string, number>;
}

export interface BeybladeConfig {
  attackRing: PartDefinition;
  weightDisk: PartDefinition;
  spinTip: PartDefinition;
}

export type ArenaType = 'classic' | 'volcano' | 'ice' | 'void' | 'sakura'
