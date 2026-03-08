import type { TerrainWorkerMessage, TerrainWorkerResponse } from './type'
import { createWorldState, generateTerrain, simulateSandGravity } from '../world-state'

// eslint-disable-next-line no-restricted-globals
const workerSelf = self as unknown as { onmessage: ((event: MessageEvent) => void) | null; postMessage: (message: unknown, transfer?: Transferable[]) => void }

workerSelf.onmessage = (event: MessageEvent<TerrainWorkerMessage>) => {
  if (event.data.type === 'generate') {
    const state = createWorldState()
    generateTerrain(state)
    const sandFalls = simulateSandGravity(state)

    const response: TerrainWorkerResponse = {
      type: 'terrain-ready',
      worldState: state,
      sandFalls,
    }

    workerSelf.postMessage(response, [state.buffer])
  }
}
