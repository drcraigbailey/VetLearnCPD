import OpenAI from "openai"

export async function generateReflection(
  title,
  category,
  notes = "",
  draft = ""
) {
  const isEnabled = localStorage.getItem("vetlearn-ai-enabled") === "true"
  const apiKey = localStorage.getItem("vetlearn-openai-key")

  if (!isEnabled || !apiKey) {
    return draft || `Reviewed ${title} and identified learning points relevant to first opinion practice.`
  }

  const client = new OpenAI({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true
  })

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini", // Updated to the faster/cheaper model
      messages: [
        {
          role: "system",
          content: `
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
        },
        {
          role: "user",
          content: `Topic: ${title}\nCategory: ${category}\nUser Notes: ${notes}\nUser Draft: ${draft}`
        }
      ]
    })

    return response.choices[0].message.content

  } catch (error) {
    console.error("AI Generation Error:", error)
    return draft || `Reviewed ${title} and identified learning points relevant to first opinion practice.`
  }
}