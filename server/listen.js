import { once } from 'node:events'

export async function listenOnAvailablePort(app, { host = '127.0.0.1', port = 3220, retryOnConflict = true } = {}) {
  for (let candidate = port; candidate <= 65535; candidate++) {
    const server = app.listen(candidate, host)
    try {
      await once(server, 'listening')
      return { server, port: server.address().port }
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || !retryOnConflict || port === 0) throw error
    }
  }
  throw new Error('没有可用端口')
}
