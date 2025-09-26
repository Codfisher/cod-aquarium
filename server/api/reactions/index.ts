import type { Env } from '../../type'
import { zValidator } from '@hono/zod-validator'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import z from 'zod'

export const reactionsApi = new Hono<Env>().basePath('/api/reactions')

/** 取得文章有多少響應 */
reactionsApi.get(
  '/',
  zValidator(
    'query',
    z.object({
      articleId: z
        .string()
        .trim()
        .transform((value) => value.replace(/^\/+|\/+$/g, ''))
        .refine(
          (value) => value.includes('blog-') || value.includes('column-'),
          { message: '文章 ID 無效' },
        ),
    }),
  ),
  async (ctx) => {
    const articleId = ctx.req.query('articleId')

    return ctx.text('Hello Hono!')
  },
)

/** 取得自己在此文章的響應 */
reactionsApi.get(
  '/me',
  zValidator(
    'query',
    z.object({
      articleId: z
        .string()
        .trim()
        .transform((value) => value.replace(/^\/+|\/+$/g, ''))
        .refine(
          (value) => value.includes('blog-') || value.includes('column-'),
          { message: '文章 ID 無效' },
        ),
    }),
  ),
  async (c) => {
    const articleId = c.req.query('articleId')

    const db = drizzle(c.env.DB)

    return c.text('Hello Hono!')
  },
)

/** 取得自己在此文章的響應 */
reactionsApi.put(
  '/',
  zValidator(
    'query',
    z.object({
      articleId: z
        .string()
        .trim()
        .transform((value) => value.replace(/^\/+|\/+$/g, ''))
        .refine(
          (value) => value.includes('blog-') || value.includes('column-'),
          { message: '文章 ID 無效' },
        ),
    }),
  ),
  async (ctx) => {
    const articleId = ctx.req.query('articleId')

    // 打個請求確認文章存在
    const res = await fetch(`https://codlin.me/${articleId}`)
    if (res.status === 404) {
      return ctx.json({ error: '查無此文章 (´・ω・`)' }, 404)
    }

    return ctx.text('Hello Hono!')
  },
)
