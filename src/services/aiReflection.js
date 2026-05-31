import OpenAI from "openai";

export async function generateReflection(
  article,
  apiKey
){

  if(!apiKey){

    throw new Error(
      "No OpenAI API key configured"
    );

  }

  const openai = new OpenAI({

    apiKey,

    dangerouslyAllowBrowser:true

  });

  const response =
    await openai.chat.completions.create({

      model:"gpt-4o-mini",

      messages:[

        {
          role:"system",
          content:
          "Write a concise veterinary CPD reflection."
        },

        {
          role:"user",
          content:
          `
          Title:
          ${article.title}

          Notes:
          ${article.notes}
          `
        }

      ]

    });

  return response.choices[0].message.content;

}