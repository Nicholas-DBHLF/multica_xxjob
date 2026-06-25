import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { createApp, createWebhookRequestHandler } from './http/app.js';
import { createMulticaClient } from './multica/client.js';

const config = loadConfig();
const multica = createMulticaClient({ config });
const handleProviderRequest = createWebhookRequestHandler({ config, multica });
const app = createApp({ handleProviderRequest });

createServer(app).listen(config.port, '0.0.0.0', () => {
  console.log(`Webhook service listening on ${config.port}`);
});
