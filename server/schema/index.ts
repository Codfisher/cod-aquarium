import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import z from 'zod'

export const articleIdSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^\/+|\/+$/g, ''))
  .refine(
    (value) => value.includes('blog-') || value.includes('column-'),
    { message: '文章 ID 無效' },
  )

export const reactionsTable = sqliteTable(
  'reactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    articleId: text('article_id').notNull(),
    userId: text('user_id').notNull(),
    type: text('type').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    idxArticleUser: index('idx_reactions_article_user').on(
      table.articleId,
      table.userId,
    ),

    idxArticleCreated: index('idx_reactions_article_created').on(
      table.articleId,
      table.createdAt,
    ),
  }),
)
