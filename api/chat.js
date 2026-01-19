module.exports = async (req, res) => {
  /* =========================
     CORS — MUST BE FIRST
     ========================= */
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  try {
    /* =========================
       GET — Health Check
       ========================= */
    if (req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({
        ok: true,
        message: "Use POST /api/chat"
      }));
    }

    /* =========================
       POST — Chat Handling
       ========================= */
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Method not allowed" }));
    }

    // Parse body safely
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const messages = Array.isArray(body.messages) ? body.messages : null;
    if (!messages) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({
        error: "Invalid payload: messages must be an array"
      }));
    }

    if (!process.env.OPENAI_API_KEY) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({
        error: "Missing OPENAI_API_KEY in Vercel environment variables"
      }));
    }

    /* =========================
       OpenAI Request
       ========================= */
    const systemPrompt =
      "You are a friendly assistant for ROMA Heating & Cooling in Greater Vancouver. " +
      "Keep replies short and natural. Help users explain their heating, boiler, or heat pump issue. " +
      "Gently ask for name, phone, email, and city without being pushy. " +
      "If the user shares contact info, confirm help is on the way.";

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
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

    const openaiData = await openaiResponse.json();

    if (!openaiResponse.ok) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({
        error: "OpenAI error",
        details: openaiData?.error?.message || "Unknown OpenAI error"
      }));
    }

    const reply =
      openaiData?.choices?.[0]?.message?.content ||
      "Sorry, can you rephrase that?";

    /* =========================
       Lead Extraction (Soft)
       ========================= */
    const allText = messages.map(m => m?.content || "").join(" ");

    const lead = {
      issue: allText,
      name: (allText.match(/name is ([a-zA-Z ]+)/i)?.[1] || "").trim(),
      phone: (allText.match(/(\+?\d[\d\s\-]{7,})/)?.[1] || "").trim(),
      email: (allText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "").trim(),
      city: (allText.match(/in ([a-zA-Z ]+)/i)?.[1] || "").trim()
    };

    /* =========================
       Send Lead to Zapier
       ========================= */
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

    /* =========================
       Return Reply
       ========================= */
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ reply }));

  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({
      error: "Server crash",
      details: String(err?.message || err)
    }));
  }
};
