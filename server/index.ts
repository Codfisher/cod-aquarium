import type { Env } from './type'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'

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

const reactionsApi = new Hono<Env>().basePath('/api/reactions')

/** 取得文章有多少響應 */
reactionsApi.get(
  '/',
  zValidator(
    'query',
    z.object({
      articleId: z.string().refine(
        (value) => value.includes('blog-') || value.includes('column-'),
        { message: '文章 ID 無效' },
      ),
    }),
  ),
  (ctx) => {
    return ctx.text('Hello Hono!')
  },
)

export default app
