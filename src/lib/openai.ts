import OpenAI from "openai";

export const AGENT_MODEL = "gpt-4o";

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
