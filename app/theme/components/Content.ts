import type { Component, PropType } from 'vue'
import { NuxtPage } from '#components'
import { defineComponent, h } from 'vue'

/** 對應 VitePress 的 <Content>：外層包一個 div 再渲染當前頁面。
 * class 等屬性（例如 VPDoc 傳入的 vp-doc）落在外層 div，DOM 結構與 VitePress 相同
 */
export default defineComponent({
  name: 'VitePressContent',
  props: {
    as: {
      type: [Object, String] as PropType<string | Component>,
      default: 'div',
    },
  },
  setup(props) {
    return () => h(props.as, { style: { position: 'relative' } }, [h(NuxtPage)])
  },
})
