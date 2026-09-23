import { ChatGroq } from "@langchain/groq";

export function getChatModel(temperature = 0) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing");
  }

  return new ChatGroq({
    apiKey,
    model: process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile",
    temperature,
  });
}