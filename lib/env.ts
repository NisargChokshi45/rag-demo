/**
 * Environment variable validation and defaults
 * Call validateEnv() at startup to verify required keys are present
 */

export interface EnvConfig {
  // Supabase
  supabaseUrl: string;
  supabaseServiceKey: string;
  supabaseAnonKey: string;

  // Embeddings
  googleApiKey: string;
  geminiEmbeddingModel: string;

  // LLM (Groq)
  groqApiKey: string;
  groqChatModel: string;

  // App
  nodeEnv: string;
}

export function getEnvConfig(): EnvConfig {
  const config: EnvConfig = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    googleApiKey: process.env.GOOGLE_API_KEY || "",
    geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2",
    groqApiKey: process.env.GROQ_API_KEY || "",
    groqChatModel: process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile",
    nodeEnv: process.env.NODE_ENV || "development",
  };

  return config;
}

const REQUIRED_SERVER_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "GOOGLE_API_KEY",
  "GROQ_API_KEY",
];

/**
 * Validate that all required environment variables are set
 * Call this in API routes that need external services
 */
export function validateEnv(scope: "server" | "client" = "server"): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  if (scope === "server") {
    for (const key of REQUIRED_SERVER_ENV) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get a formatted error message for missing env vars
 */
export function getMissingEnvMessage(missing: string[]): string {
  const envVars = missing.join(", ");
  return `Missing required environment variables: ${envVars}. Please check your .env.local file.`;
}
