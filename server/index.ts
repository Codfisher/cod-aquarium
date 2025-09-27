import type { Env } from './type'
import { Hono } from 'hono'
import { getSignedCookie, setSignedCookie } from 'hono/cookie'
import { cors } from 'hono/cors'
import { pipe } from 'remeda'
import { reactionsApi } from './api/reactions'

const COOKIE_NAME = 'user-id'

const app = new Hono<Env>()

app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'x-user-id'],
  credentials: true,
}))

// 取得使用者 ID
app.use('/api/*', async (c, next) => {
  const secret = c.env.COOKIE_SECRET ?? 'codlin-secret'
  const uid = await pipe(
    c.req.header('x-user-id')?.trim(),
    async (id) => {
      const signedValue = await getSignedCookie(c, secret, COOKIE_NAME)

      if (typeof signedValue === 'string' && signedValue) {
        return signedValue
      }

      return id
    },
  )

  if (!uid) {
    return c.json({ error: '來者何人？(⌐■_■)' }, 401)
  }

  await setSignedCookie(c, COOKIE_NAME, uid, secret, {
    path: '/',
    httpOnly: true,
    sameSite: 'none',
    secure: true,
  })

  c.set('userId', uid)
  await next()
})

const routes = app.route('/', reactionsApi)

export default app
export type AppType = typeof routes
