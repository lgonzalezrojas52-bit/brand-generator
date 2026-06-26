export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const {
    prompt,
    apiKey,
    aiConfig,
    referenceImage,
    referenceImages
  } = req.body;

  const finalApiKey = aiConfig?.apiKey || apiKey;
  const provider = aiConfig?.provider || "gemini";
  const imageModel = aiConfig?.imageModel || "gemini-3.1-flash-image";

  if (!prompt) {
    return res.status(400).json({
      error: "Falta el prompt"
    });
  }

  if (!finalApiKey) {
    return res.status(400).json({
      error: "Falta la API Key"
    });
  }

  if (provider !== "gemini") {
    return res.status(400).json({
      error: "Por ahora este endpoint solo soporta Gemini. Después sumamos OpenAI."
    });
  }

  try {
    const parts = [
      {
        text: prompt
      }
    ];

    if (Array.isArray(referenceImages) && referenceImages.length > 0) {
      referenceImages.forEach((img) => {
        if (img && img.data) {
          parts.push({
            inlineData: {
              mimeType: img.mimeType || "image/png",
              data: img.data
            }
          });
        }
      });
    } else if (referenceImage && referenceImage.data) {
      parts.push({
        inlineData: {
          mimeType: referenceImage.mimeType || "image/png",
          data: referenceImage.data
        }
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:generateContent?key=${finalApiKey}`,
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
        provider,
        model: imageModel,
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
        provider,
        model: imageModel,
        raw: data
      });
    }

    return res.status(200).json({
      text,
      image,
      mimeType,
      provider,
      model: imageModel
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
