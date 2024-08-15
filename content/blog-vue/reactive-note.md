# Vue Reactive 使用筆記

使用 Vue 定義資料時，到底要用 ref 還是 reactive 是一個很常見的問題，不過官方文檔推薦使用 ref 就行，所以其實也不是甚麼大問題了。( •̀ ω •́ )✧

一般情況下的確 ref 更好，坑也相對少一點，且更容易拆分邏輯，詳細說明可以看看[尤大訪談](https://www.youtube.com/watch?v=e8Wlv4AGJjk&ab_channel=%E6%88%90%E5%BC%8F%E8%AA%9E%E8%A8%80%2FMikeCheng)。

所以 reactive 真的沒用用途了嗎？這篇文章來記錄一下 reactive 的用法。

不定期更新，會持續補充用法。( ´ ▽ ` )ﾉ

## 解包響應式資料

以 VueUse 的 [useElementBounding](https://vueuse.org/core/useElementBounding/) 為例。

此 API 可以取得多個 element 的 bounding 資料，只需要寬高資料，就可以只取出寬高：

```ts
const { width, height } = useElementBounding(el)
```

但是有時候會需要全部都要，可能會這樣寫：

```ts
const bounding = useElementBounding(el)
```

這時候因為內部資料還是 ref，所以取值需要 .value（例如 `bounding.width.value`），這個時候就可以先用 reactive 包起來：

```ts
const bounding = reactive(useElementBounding(el))
```

包起來後，就可以 `bounding.width`，不用 value 了

以上用法供大家參考，若有錯誤還請大家多多指教。