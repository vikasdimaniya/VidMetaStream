const app = require('./app.js');
const core = require('./core.js');
const start = async () => {
  try {
    await core.initMongo();
    await app.listen({ port: 8000 });
    console.log(`server listening on ${app.server.address().port}`);
  } catch (err) {
    console.error(err);
    process.exit(1)
  }
}
start()