import { buildServer } from './server.js';

const app = buildServer();
const port = Number(process.env.PORT ?? 8787);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`[offerpilot-api] listening on :${port} (llm mode: ${process.env.DASHSCOPE_API_KEY ? 'dashscope' : 'offline-mock'})`);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
