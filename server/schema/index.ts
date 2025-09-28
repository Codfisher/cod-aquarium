import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
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
    articleId: text('article_id').notNull(),
    userId: text('user_id').notNull(),
    like: integer('like').notNull().default(0),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.articleId, table.userId] }),
    index('idx_reactions_article_user').on(table.articleId, table.userId),
    index('idx_reactions_article_updated').on(table.articleId, table.updatedAt),
  ],
)
