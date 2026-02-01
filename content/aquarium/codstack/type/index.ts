export interface ModelFile {
  name: string;
  /** 相對路徑 (例如: subfolder/model.glb) */
  path: string;
  file: File;
}

export interface MeshMeta {
  name: string;
  path: string;
}

export interface SceneSettings {
  /** 預覽時是否要旋轉 */
  enablePreviewRotation: boolean;
  /** 預覽模型的垂直軸起點 */
  previewBaseY: number;
}
