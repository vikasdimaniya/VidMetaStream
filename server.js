import { app } from './app.js'
import core from './core.js'
const start = async () => {
    try {
      await app.listen({ port: 8000 });
      await core.initMongo();
      console.log(`server listening on ${app.server.address().port}`);
    } catch (err) {
      app.log.error(err)
      process.exit(1)
    }
  }
  start()