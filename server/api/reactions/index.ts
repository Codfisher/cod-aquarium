import type { Env } from '../../type'
import { zValidator } from '@hono/zod-validator'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { pipe, tap } from 'remeda'
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
      const db = drizzle(ctx.env.DB)
      const { articleId } = ctx.req.valid('query')
      const userId = ctx.get('userId')

      const [yoursRow] = await db
        .select({ count: sql<number>`coalesce(${reactionsTable.like}, 0)` })
        .from(reactionsTable)
        .where(and(
          eq(reactionsTable.articleId, articleId),
          eq(reactionsTable.userId, userId),
        ))

      const [totalRow] = await db
        .select({ total: sql<number>`coalesce(sum(${reactionsTable.like}), 0)` })
        .from(reactionsTable)
        .where(eq(reactionsTable.articleId, articleId))

      return ctx.json({
        total: totalRow?.total ?? 0,
        yours: yoursRow?.count ?? 0,
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
        count: z.number().min(1).max(10).default(1),
      }),
    ),
    async (ctx) => {
      const { articleId, count: newCount } = ctx.req.valid('json')
      const userId = ctx.get('userId')
      const db = drizzle(ctx.env.DB)

      // 此文章是否有任何人響應過
      const [existingRow] = await db
        .select({ data: sql`1` }) 
        .from(reactionsTable)
        .where(eq(reactionsTable.articleId, articleId))
        .limit(1);

      if (!existingRow?.data) {
        // 打個請求確認文章存在
        const res = await fetch(`https://codlin.me/${articleId}`)
        if (res.status === 404) {
          return ctx.json({ error: '查無此文章 (´・ω・`)' }, 404)
        }
      }

      const userReactionCount = pipe(
        await db
          .select({ count: sql<number>`coalesce(${reactionsTable.like}, 0)` })
          .from(reactionsTable)
          .where(and(
            eq(reactionsTable.articleId, articleId),
            eq(reactionsTable.userId, userId),
          )),
        ([item]) => item?.count ?? 0,
      )

      // 上限 10 個讚
      if (userReactionCount >= 10) {
        return ctx.json({ error: '已達到最大讚數' }, 429)
      }

      // 此文章今日讚數上限
      const now = new Date()
      const todayStart = pipe(
        new Date(now),
        tap((date) => date.setUTCHours(0, 0, 0, 0))
      );
      const todayEnd = pipe(
        new Date(now),
        tap((date) => date.setUTCHours(23, 59, 59, 999))
      );

      const todayReactionCount = pipe(
        await drizzle(ctx.env.DB)
          .select({
            count: sql<number>`count(*)`,
          })
          .from(reactionsTable)
          .where(and(
            eq(reactionsTable.articleId, articleId),
            gte(reactionsTable.updatedAt, todayStart),
            lte(reactionsTable.updatedAt, todayEnd),
          )),
        ([item]) => item?.count ?? 0,
      )

      if (todayReactionCount >= 2000) {
        return ctx.json(
          { error: '感謝大家的熱情，此文今日讚數已達上限，請明天再來 (*´∀`)~♥' },
          429,
        )
      }

      await db.insert(reactionsTable)
        .values({ articleId, userId, like: newCount, updatedAt: now })
        .onConflictDoUpdate({
          target: [reactionsTable.articleId, reactionsTable.userId],
          set: {
            like: sql`min(${newCount}, 10)`,
            updatedAt: now,
          },
        })


      return ctx.json({})
    },
  )
