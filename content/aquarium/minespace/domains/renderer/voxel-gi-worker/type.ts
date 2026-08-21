/**
 * 世界只送這一次
 *
 * 這個世界不可編輯，粗網格的形狀、實心與否、反照色、燈火的位置
 * 從頭到尾不會變——會變的只有太陽。世界那份資料只在剛生成完的時候
 * 送一次，之後每次重烘只送太陽的方向、顏色與強度，不必再把幾十萬格
 * 的陣列搬過去一次
 */
export interface VoxelGiInitMessage {
  type: 'init';
  gridX: number;
  gridY: number;
  gridZ: number;
  solidList: Uint8Array;
  albedoList: Float32Array;
  skyVisibilityList: Float32Array;
  /**
   * 圖集一列排幾塊磚
   *
   * 輸出不是照格子的順序排的，是照 2D 圖集的像素順序——
   * 每一層 Y 切片是一塊磚，並排成一張二維的圖。
   * 理由見 voxel-gi.ts：這個世界裡的 sampler3D 會與別的取樣器
   * 撞到同一個材質單元，而 2D 是這份程式碼裡已經走通的路
   */
  tilesPerRow: number;
  atlasWidth: number;
  atlasHeight: number;
  /** 每盞燈落在哪個粗格、多亮、什麼顏色 */
  lightSeedList: { cellIndex: number; level: number; color: readonly [number, number, number] }[];
}

export interface VoxelGiBakeMessage {
  type: 'bake';
  /** 回應要附上同一個編號，呼叫端才認得出這是哪一次請求的結果 */
  requestId: number;
  sunColor: [number, number, number];
  sunStrength: number;
  /** 跑幾輪反彈，由畫質設定表決定 */
  bouncePassCount: number;
}

export type VoxelGiWorkerMessage = VoxelGiInitMessage | VoxelGiBakeMessage

export interface VoxelGiBakeResponse {
  type: 'bake-ready';
  requestId: number;
  /**
   * RGBA8，長度為 atlasWidth × atlasHeight × 4，直接餵給 RawTexture.update
   *
   * RGB 是間接光；A 固定給滿、沒有人在用。
   * 那一欄曾經存「這一格照得到多少直射陽光」給光束行進用，
   * 但粗格擋不出邊界分明的陰影體積，光束改成自己畫一張
   * 逐方塊解析度的深度圖（見 volumetric-shadow.ts）
   */
  textureData: Uint8Array;
}

export type VoxelGiWorkerResponse = VoxelGiBakeResponse
