import { registerSW } from "virtual:pwa-register";

/**
 * 只做「静默更新」：新版本装好后下次进入自动生效。
 * plan §七 明确不做推送，所以这里不发任何通知，也不弹更新条。
 */
export function registerPwa(): void {
  if (import.meta.env.DEV) return;
  registerSW({ immediate: true });
}