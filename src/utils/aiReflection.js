import OpenAI from "openai"

const client = new OpenAI({

apiKey: import.meta.env.VITE_OPENAI_API_KEY,

dangerouslyAllowBrowser:true

})

export async function generateReflection(

title,
category,
notes="",
draft=""

){

try{

const response=

await client.chat.completions.create({

model:"gpt-4.1-mini",

messages:[

{

role:"system",

content:`

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

role:"user",

content:

`

Topic:
${title}

Category:
${category}

User Notes:
${notes}

User Draft:
${draft}

`

}

]

})

return response
.choices[0]
.message
.content

}

catch{

return draft ||

`Reviewed ${title} and identified learning points relevant to first opinion practice.`

}

}