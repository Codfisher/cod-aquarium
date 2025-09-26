import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const reactions = sqliteTable('reactions', {
  id: text('id').primaryKey(),
  articleId: text('article_id').notNull(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
