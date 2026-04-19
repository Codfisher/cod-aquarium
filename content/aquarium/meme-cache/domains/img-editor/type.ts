export type AlignTarget = {
  type: 'point';
  x: number;
  y: number;
} | {
  type: 'axis';
  x: number;
} | {
  type: 'axis';
  y: number;
}
