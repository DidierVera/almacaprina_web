// Tells Telegram where to send button presses (the telegram-webhook Edge Function).
// Run it once, from your own computer. The secrets are read from environment variables so they never end up in a file or in git:
//   PowerShell:  $env:TELEGRAM_BOT_TOKEN='...'; $env:TELEGRAM_WEBHOOK_SECRET='...'; node scripts/set-telegram-webhook.mjs
import { SUPABASE_URL } from '../js/supabase-config.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!token || !secret) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET.');
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret)) {
  console.error('TELEGRAM_WEBHOOK_SECRET must be 16-256 characters: letters, digits, "_" or "-" only.');
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url: `${SUPABASE_URL}/functions/v1/telegram-webhook`,
    secret_token: secret,
    allowed_updates: ['callback_query'],
    drop_pending_updates: true,
  }),
});
const body = await res.json();
console.log(body.ok ? 'Webhook set.' : `Telegram refused: ${body.description}`);
process.exit(body.ok ? 0 : 1);
