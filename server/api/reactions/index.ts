import type { Env } from '../../type'
import { zValidator } from '@hono/zod-validator'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { pipe, prop, sumBy } from 'remeda'
import z from 'zod'
import { articleIdSchema, reactionsTable } from '../../schema'

export const reactionsApi = new Hono<Env>()
  .basePath('/api/reactions')
  /** 取得文章有多少響應（包含自己） */
  .get(
    '/',
    zValidator(
      'query',
      z.object({
        articleId: articleIdSchema,
      }),
    ),
    async (ctx) => {
      const { articleId } = ctx.req.valid('query')
      const userId = ctx.get('userId')

      const [item] = await drizzle(ctx.env.DB)
        .select({
          total: sql<number>`count(*)`,
          yours: sql<number>`
          coalesce(
            sum(case when ${reactionsTable.userId} = ${userId} then 1 else 0 end),
            0
          )
        `,
        })
        .from(reactionsTable)
        .where(eq(reactionsTable.articleId, articleId))

      return ctx.json({
        total: item?.total ?? 0,
        yours: item?.yours ?? 0,
      })
    },
  )
  /** 響應文章 */
  .post(
    '/',
    zValidator(
      'json',
      z.object({
        articleId: articleIdSchema,
        // 目前預設都是 like
        // type: z.string().trim().min(1),
      }),
    ),
    async (ctx) => {
      const { articleId } = ctx.req.valid('json')
      const userId = ctx.get('userId')

      const reactionCount = pipe(
        await drizzle(ctx.env.DB)
          .select({ count: sql<number>`count(*)` })
          .from(reactionsTable)
          .where(and(
            eq(reactionsTable.articleId, articleId),
            eq(reactionsTable.userId, userId),
          )),
        ([item]) => item?.count ?? 0,
      )

      if (reactionCount === 0) {
        // 打個請求確認文章存在
        const res = await fetch(`https://codlin.me/${articleId}`)
        if (res.status === 404) {
          return ctx.json({ error: '查無此文章 (´・ω・`)' }, 404)
        }
      }

      // 上限 10 個讚
      if (reactionCount >= 10) {
        return ctx.json({ error: '已達到最大讚數' }, 429)
      }

      // 此文章今日已達 500 讚
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const todayReactionCount = pipe(
        await drizzle(ctx.env.DB)
          .select({
            count: sql<number>`count(*)`,
          })
          .from(reactionsTable)
          .where(and(
            eq(reactionsTable.articleId, articleId),
            gte(reactionsTable.createdAt, todayStart),
            lte(reactionsTable.createdAt, todayEnd),
          )),
        ([item]) => item?.count ?? 0,
      )

      if (todayReactionCount >= 500) {
        return ctx.json(
          { error: '感謝大家的熱情，此文今日讚數已達上限，請明天再來 (*´∀`)~♥' },
          429,
        )
      }

      await drizzle(ctx.env.DB)
        .insert(reactionsTable)
        .values({
          articleId,
          userId,
          type: 'like',
          createdAt: new Date(),
        })

      const count = reactionCount + 1

      return ctx.json({ count })
    },
  )
