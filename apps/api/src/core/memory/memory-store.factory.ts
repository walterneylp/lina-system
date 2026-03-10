import { LinaEnv } from "../../config/env";
import { MemoryStore } from "./memory-store.interface";
import { LocalMemoryStore } from "./local-memory-store";
import { SupabaseMemoryStore } from "./supabase-memory-store";

export const createMemoryStore = (env: LinaEnv): MemoryStore => {
  if (env.supabaseUrl && env.supabaseServiceRoleKey) {
    return new SupabaseMemoryStore({
      url: env.supabaseUrl,
      serviceRoleKey: env.supabaseServiceRoleKey,
    });
  }

  return new LocalMemoryStore();
};

export const createMemoryStoreWithFallback = async (env: LinaEnv): Promise<MemoryStore> => {
  const primaryStore = createMemoryStore(env);
  const health = await primaryStore.getHealth();

  if (health.provider === "supabase" && !health.connected) {
    console.warn(
      `[LiNa] Supabase unavailable or schema not ready (${health.details || "unknown"}). Falling back to local persistence.`
    );
    return new LocalMemoryStore();
  }

  return primaryStore;
};
