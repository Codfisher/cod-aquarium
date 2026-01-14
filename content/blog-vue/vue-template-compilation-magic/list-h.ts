import { h } from 'vue'

export default {
  props: ['items'],
  setup(props: { items: any[] }) {
    return () => h('div', { class: 'root-container' }, props.items.map((item) =>
      h('div', { 'key': item.id, 'class': 'card-wrapper', 'data-test': 'static-attr' }, [
        h('div', { class: 'card-header', style: 'background: #eee; padding: 10px; border-bottom: 1px solid #ddd;' }, [
          h('h4', { class: 'title', style: 'margin: 0; color: #333;' }, '靜態標題 - Level 1'),
          h('span', { class: 'badge', style: 'background: red; color: white; padding: 2px 5px;' }, 'Static Badge'),
        ]),

        h('div', { class: 'level-2-wrapper', style: 'display: flex; gap: 10px; padding: 10px;' }, [
          h('div', { class: 'static-col-left', style: 'width: 50px; background: #ccc;' }, 'Left'),

          h('div', { class: 'level-3-wrapper', style: 'flex: 1; border: 1px dashed blue;' }, [
            h('ul', { class: 'static-list', style: 'list-style: none; margin: 0; padding: 0;' }, [
              h('li', { style: 'padding: 5px;' }, 'Static List Item A'),
              h('li', { style: 'padding: 5px;' }, 'Static List Item B'),

              h('li', { class: 'level-4-target', style: 'padding: 5px; background: #eef;' }, [
                h('span', { class: 'label', style: 'font-weight: bold; margin-right: 10px;' }, 'Value:'),

                h('span', { class: 'dynamic-val', style: 'color: blue; font-size: 1.2em;' }, item.text),
              ]),
            ]),
          ]),
        ]),

        h('div', { class: 'card-footer', style: 'padding: 5px; text-align: center; color: #999;' }, 'Copyright © 2024 Static Inc.'),
      ]),
    ))
  },
}
