export interface ModelFile {
  name: string;
  /** 相對路徑 (例如: subfolder/model.glb) */
  path: string;
  file: File;
}

export interface MeshMeta {
  /** 自定義 mesh 名稱 */
  name: string;
  fileName: string;
  path: string;

  // 物理屬性
  mass: number;
  restitution: number;
  friction: number;
}

export interface MetadataField<T = string | number | boolean> {
  label: string;
  type: 'number' | 'string' | 'boolean';
  description?: string;
  key: string;
  defaultValue: T;
}

export interface SceneSettings {
  /** 預覽時是否要旋轉 */
  enablePreviewRotation: boolean;
  /** 於 ground 上，預覽模型的垂直軸起點 */
  previewGroundYOffset: number;

  /** metadata 欄位定義 */
  metadata: {
    mass: MetadataField<number>;
    restitution: MetadataField<number>;
    friction: MetadataField<number>;
    otherFieldList: MetadataField[];
  };
}
