module.exports = async (req, res) => {
  try {
    // Always respond to GET with 200 so browser test never crashes
    if (req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true, message: "Use POST /api/chat" }));
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Method not allowed" }));
    }

    // Ensure body exists
    const body = req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages : null;

    if (!messages) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Invalid payload: messages must be an array" }));
    }

    if (!process.env.OPENAI_API_KEY) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Missing OPENAI_API_KEY in Vercel env vars" }));
    }

    const systemPrompt =
      "You are a friendly assistant for ROMA Heating & Cooling in Greater Vancouver. " +
      "Keep replies short and natural. Help users explain their heating/boiler/heat pump issue. " +
      "Gently ask for name, phone, email, and city without being pushy. " +
      "If the user shares contact info, confirm help is on the way.";

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
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({
        error: "OpenAI error",
        details: data?.error?.message || "Unknown"
      }));
    }

    const reply = data?.choices?.[0]?.message?.content || "Sorry—can you try again?";

    const allText = messages.map(m => (m && m.content ? String(m.content) : "")).join(" ");
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

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ reply }));

  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Server crash", details: String(e?.message || e) }));
  }
};
