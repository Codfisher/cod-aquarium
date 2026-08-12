import type { TerrainWorkerMessage, TerrainWorkerResponse } from './type'
import { createWorldState } from '../world-access'
import { generateWorld } from '../world-generator'

// eslint-disable-next-line no-restricted-globals
const workerSelf = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
}

workerSelf.onmessage = (event: MessageEvent<TerrainWorkerMessage>) => {
  if (event.data.type !== 'generate')
    return

  const state = createWorldState()
  generateWorld(state)

  const response: TerrainWorkerResponse = {
    type: 'terrain-ready',
    worldState: state,
  }

  workerSelf.postMessage(response, [state.buffer])
}
