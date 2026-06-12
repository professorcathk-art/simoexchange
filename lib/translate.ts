import OpenAI from "openai";
import type { LangCode } from "@/types";

const langNames: Record<LangCode, string> = {
  en: "English",
  zh: "Mandarin Chinese",
  ja: "Japanese",
  ko: "Korean",
};

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.AIML_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("AIML_API_KEY (or OPENAI_API_KEY) must be set");
  }

  return new OpenAI({
    apiKey,
    baseURL: "https://api.aimlapi.com/v1",
  });
}

export async function translate(
  text: string,
  sourceLang: LangCode,
  targetLang: LangCode
): Promise<string> {
  const openai = getOpenAIClient();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a professional simultaneous interpreter. Translate the following ${langNames[sourceLang]} text into ${langNames[targetLang]}. Output ONLY the translated text, no explanations, no quotation marks.`,
      },
      { role: "user", content: text },
    ],
    temperature: 0.1,
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}
