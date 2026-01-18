export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages } = req.body;

    const systemPrompt = `
You are a friendly assistant for ROMA Heating & Cooling in Greater Vancouver.
Keep replies short and natural.
Help users explain their heating, boiler, or heat pump issue.
Gently ask for name, phone, email, and city without being pushy.
If the user shares contact info, confirm help is on the way.
`;

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": \`Bearer \${process.env.OPENAI_API_KEY}\`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages
          ]
        })
      }
    );

    const aiData = await openaiResponse.json();
    const reply = aiData.choices?.[0]?.message?.content || "";

    const allText = messages.map(m => m.content).join(" ");

    const lead = {
      issue: allText,
      name: allText.match(/name is ([a-zA-Z ]+)/i)?.[1] || "",
      phone: allText.match(/(\+?\d[\d\s\-]{7,})/)?.[1] || "",
      email: allText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "",
      city: allText.match(/in ([a-zA-Z ]+)/i)?.[1] || ""
    };

    if (lead.phone || lead.email) {
      await fetch(
        "https://hooks.zapier.com/hooks/catch/14133549/ug7yfjo/",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lead)
        }
      );
    }

    res.status(200).json({ reply });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
}
