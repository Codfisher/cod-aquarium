export interface ModelFile {
  name: string;
  /** 相對路徑 (例如: subfolder/model.glb) */
  path: string;
  file: File;
}

export interface MeshMeta {
  fileName: string;
  path: string;

  // 物理屬性
  mass: number;
  restitution: number;
  friction: number;
}

export interface SceneSettings {
  /** 預覽時是否要旋轉 */
  enablePreviewRotation: boolean;
  /** 於 ground 上，預覽模型的垂直軸起點 */
  previewGroundYOffset: number;
}
