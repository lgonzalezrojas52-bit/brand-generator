export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const { prompt, apiKey, referenceImage } = req.body;

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
    const parts = [
      {
        text: prompt
      }
    ];

    if (referenceImage && referenceImage.data) {
      parts.push({
        inlineData: {
          mimeType: referenceImage.mimeType || "image/png",
          data: referenceImage.data
        }
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts
            }
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"]
          }
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

    const responseParts = data?.candidates?.[0]?.content?.parts || [];

    let text = "";
    let image = null;
    let mimeType = "image/png";

    for (const part of responseParts) {
      if (part.text) {
        text += part.text;
      }

      if (part.inlineData?.data) {
        image = part.inlineData.data;
        mimeType = part.inlineData.mimeType || "image/png";
      }
    }

    if (!image) {
      return res.status(500).json({
        error: "Gemini respondió, pero no devolvió imagen",
        raw: data
      });
    }

    return res.status(200).json({
      text,
      image,
      mimeType
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
