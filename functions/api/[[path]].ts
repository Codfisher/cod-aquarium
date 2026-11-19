import { handle } from 'hono/cloudflare-pages'
import app from '../../server/hono'

/** 正式環境的 /api/* 由 Pages Functions 直接交給 Hono；nuxt dev 時則走 server/routes/api/[...].ts */
export const onRequest = handle(app)
