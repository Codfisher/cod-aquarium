/** Babylon 的 side-effect import 集中處。
 *
 * Babylon 走深層路徑 tree-shaking，許多功能（陰影、物理、射線、後製所需的
 * depth/geometry buffer）要另外 import 對應的 scene component 才會註冊。
 * 這些 import 散在各檔最容易在搬移模組時漏掉，統一收在這裡，
 * 新場景只要 `import './engine/babylon-side-effects'` 就補齊。
 */
import '@babylonjs/core/Culling/ray'
import '@babylonjs/core/Layers/effectLayerSceneComponent'
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent'
// scene.enablePhysics、getPhysicsEngine 由這支註冊；v2 的 physicsEngineComponent 只補 TransformNode.physicsBody。
// VitePress 時代碰巧被其他 app 的整包匯入帶進共用 chunk 才沒出事，拆 chunk 後要明確匯入
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent'
import '@babylonjs/core/Physics/v2/physicsEngineComponent'
import '@babylonjs/core/Rendering/depthRendererSceneComponent'
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent'
import '@babylonjs/core/Rendering/outlineRenderer'
