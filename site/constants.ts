import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 專案根目錄 */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** md 文章與頁面所在目錄 */
export const CONTENT_PATH = path.join(PROJECT_ROOT, 'content')
/** 靜態資源目錄 */
export const CONTENT_PUBLIC_DIR = path.join(CONTENT_PATH, 'public')
/** nuxt generate 的輸出目錄，Cloudflare Pages 由此部署 */
export const DIST_PATH = path.join(PROJECT_ROOT, 'dist')

export const MEME_NDJSON_RELATIVE_PATH = 'content/public/memes/a-memes-data.ndjson'
export const MEME_EXTEND_NDJSON_RELATIVE_PATH = 'content/public/memes/a-memes-data-extend.ndjson'

export const HOSTNAME = 'https://codlin.me'
export const SITE_TITLE = '鱈魚的魚缸'
export const SITE_DESCRIPTION = '各種鱈魚滾鍵盤的雜記與研究'
export const SITE_LANG = 'zh-Hant'
export const SITE_EMAIL = 'hi@codlin.me'
export const AUTHOR_NAME = '鱈魚 (Cod Lin)'
export const COPYRIGHT = 'Copyright © 2024-present <a href="mailto:hi@codlin.me">Cod Lin</a>'
