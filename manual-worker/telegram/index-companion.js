import { handleTelegramWithEnv } from "./telegram-router.js";

export { SessionDO } from "./session-do.js";

export default {
  async fetch(request, env) {
    const response = await handleTelegramWithEnv(request, env);
    if (response) return response;
    return new Response(null, { status: 404, headers: { "x-tcb-passthrough": "1" } });
  }
};
