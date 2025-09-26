import type { Env } from './type'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono<Env>()

app.use('/api/*', cors({
  origin: 'https://codlin.me',
  credentials: true,
}))

// 取得使用者 ID
app.use('/api/*', async (ctx, next) => {
  const user = ctx.req.header('x-user-id')?.trim()
  if (user)
    ctx.set('userId', user)
  await next()
})

/** 取得文章有多少響應 */
app.get('/api/reactions', (ctx) => {
  return ctx.text('Hello Hono!')
})

export default app
