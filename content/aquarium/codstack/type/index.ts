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
  name: string;
  path: string;
}
