import tcb from "./tcb-worker.js";
import { handleTelegramWithEnv } from "./telegram-router.js";

export { SessionDO } from "./session-do.js";

export default {
  async fetch(request, env, ctx) {
    const response = await handleTelegramWithEnv(request, env);
    if (response) return response;
    return tcb.fetch(request, env, ctx);
  }
};