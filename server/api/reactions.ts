import type { Env } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import z from 'zod'

export const reactionsApi = new Hono<Env>().basePath('/api/reactions')

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
