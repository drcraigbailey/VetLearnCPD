import { getUserAiApiKey } from "./aiApiKeyStorage"

const fallbackReflection = (title) =>
  `Reviewed ${title} and identified learning points relevant to first opinion practice.`

const systemPrompt = `
Generate a concise veterinary CPD reflection suitable for RCVS CPD recording.
Requirements:
• 50-100 words
• Professional tone
• Mention learning gained
• Mention likely impact on first opinion practice
• Incorporate user notes where relevant
• Incorporate user draft thoughts where relevant
• Single paragraph
• Avoid generic wording
`

const buildMessages = (title, category, notes, draft) => [
  { role: "system", content: systemPrompt },
  {
    role: "user",
    content: `Topic: ${title}\nCategory: ${category}\nUser Notes: ${notes}\nUser Draft: ${draft}`
  }
]

const getAiPreferences = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("vetlearn-ai-preferences") || "{}")
    return {
      provider: saved.provider || "openai",
      model: saved.model || "gpt-4o-mini"
    }
  } catch {
    return { provider: "openai", model: "gpt-4o-mini" }
  }
}

const extractText = (data, provider) => {
  if (provider === "gemini") {
    return data?.candidates?.[0]?.content?.parts?.map(part => part.text).filter(Boolean).join("\n")
  }
  return data?.choices?.[0]?.message?.content
}

const aiEndpoints = {
  openai: "https://api.openai.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions"
}

const callOpenAiCompatibleProvider = async ({ provider, model, apiKey, messages }) => {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  }

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = window.location.origin
    headers["X-Title"] = "VetLearn"
  }

  const response = await fetch(aiEndpoints[provider], {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages, temperature: 0.4 })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `${provider} request failed`)
  }

  return response.json()
}

const callGemini = async ({ model, apiKey, messages }) => {
  const prompt = messages.map(message => `${message.role.toUpperCase()}:\n${message.content}`).join("\n\n")
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 }
      })
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Gemini request failed")
  }

  return response.json()
}

export async function generateReflection(
  title,
  category,
  notes = "",
  draft = "",
  userId = null
) {
  const isEnabled = localStorage.getItem("vetlearn-ai-enabled") === "true"
  const apiKey = userId ? await getUserAiApiKey(userId) : localStorage.getItem("vetlearn-openai-key")

  if (!isEnabled || !apiKey) {
    return draft || fallbackReflection(title)
  }

  const { provider, model } = getAiPreferences()
  const messages = buildMessages(title, category, notes, draft)

  try {
    const response = provider === "gemini"
      ? await callGemini({ model, apiKey, messages })
      : await callOpenAiCompatibleProvider({ provider, model, apiKey, messages })

    return extractText(response, provider) || draft || fallbackReflection(title)
  } catch (error) {
    console.error("AI Generation Error:", error)
    return draft || fallbackReflection(title)
  }
}
