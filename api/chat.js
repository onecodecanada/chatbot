export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const systemPrompt = `
You are a friendly assistant for ROMA Heating & Cooling in Greater Vancouver.
Keep replies short and natural.
Help users explain their heating/boiler/heat pump issue.
Gently ask for name, phone, email, and city without being pushy.
If the user shares contact info, confirm help is on the way.
`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...messages]
      })
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(500).json({
        error: "OpenAI error",
        details: data?.error?.message || "Unknown"
      });
    }

    const reply = data?.choices?.[0]?.message?.content || "Sorry—can you try again?";

    const allText = messages.map(m => m?.content || "").join(" ");
    const lead = {
      issue: allText,
      name: (allText.match(/name is ([a-zA-Z ]+)/i)?.[1] || "").trim(),
      phone: (allText.match(/(\+?\d[\d\s\-]{7,})/)?.[1] || "").trim(),
      email: (allText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "").trim(),
      city: (allText.match(/in ([a-zA-Z ]+)/i)?.[1] || "").trim()
    };

    if (lead.phone || lead.email) {
      await fetch("https://hooks.zapier.com/hooks/catch/14133549/ug7yfjo/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead)
      });
    }

    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
}
