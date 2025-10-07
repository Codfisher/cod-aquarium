import type { ComponentExposed, ComponentProps } from 'vue-component-type-helpers'
import { promiseTimeout, tryOnBeforeUnmount } from '@vueuse/core'
import { h, render } from 'vue'
import BaseDialog from '../components/base-dialog/base-dialog.vue'

type DialogProps = ComponentProps<typeof BaseDialog>
type DialogExpose = ComponentExposed<typeof BaseDialog>

export function useDialog(params: DialogProps) {
  const vnode = h(
    BaseDialog,
    params,
  )

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.zIndex = '999999999'

  document.body.appendChild(container)
  render(vnode, container)

  const dialog = vnode.component?.exposed as DialogExpose
  if (!dialog) {
    throw new Error('開啟 dialog 異常')
  }

  async function close() {
    if (!container) {
      return
    }
    dialog.setStatus('hidden')

    await promiseTimeout(1000)

    render(null, container)
    container.remove()
  }

  tryOnBeforeUnmount(() => {
    close()
  })

  return {
    close,
  }
}
