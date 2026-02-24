import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error(
    "Supabase env is missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
  );
}

let nativeStorage: any | undefined;
if (Platform.OS !== "web") {
  try {
    nativeStorage = require("@react-native-async-storage/async-storage").default;
  } catch {
    console.warn(
      "[supabase] AsyncStorage is not installed. Mobile auth session will not persist across reloads."
    );
  }
}

export const supabase = createClient(url, anon, {
  auth:
    Platform.OS === "web"
      ? {
          detectSessionInUrl: false,
        }
      : {
          autoRefreshToken: true,
          persistSession: Boolean(nativeStorage),
          detectSessionInUrl: false,
          storage: nativeStorage,
        },
});

if (Platform.OS !== "web") {
  const globalFlags = globalThis as any;
  if (!globalFlags.__PERSONALENS_SUPABASE_APPSTATE_AUTORELOAD__) {
    AppState.addEventListener("change", (state) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    globalFlags.__PERSONALENS_SUPABASE_APPSTATE_AUTORELOAD__ = true;
  }
  supabase.auth.startAutoRefresh();
}
