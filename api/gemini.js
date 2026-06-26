export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const { prompt, apiKey } = req.body;

  if (!prompt) {
    return res.status(400).json({
      error: "Falta el prompt"
    });
  }

  if (!apiKey) {
    return res.status(400).json({
      error: "Falta la API Key"
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Error en Gemini",
        raw: data
      });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({
        error: "Gemini respondió, pero no devolvió texto",
        raw: data
      });
    }

    return res.status(200).json({
      text
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
