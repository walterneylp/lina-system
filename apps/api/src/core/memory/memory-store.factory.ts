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
