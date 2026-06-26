export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const {
    prompt,
    aiConfig,
    referenceImages,
    width,
    height
  } = req.body;

  if (!prompt) {
    return res.status(400).json({
      error: "Falta el prompt"
    });
  }

  const imageProvider = aiConfig?.imageProvider || "pollinations";
  const imageModel = aiConfig?.imageModel || "flux";
  const imageApiKey = aiConfig?.imageApiKey || "";

  try {
    if (imageProvider === "pollinations") {
      return await generateWithPollinations({
        res,
        prompt,
        model: imageModel,
        apiKey: imageApiKey,
        width: width || 1024,
        height: height || 1024
      });
    }

    if (imageProvider === "gemini") {
      return await generateWithGemini({
        res,
        prompt,
        aiConfig,
        referenceImages
      });
    }

    return res.status(400).json({
      error: `Proveedor de imagen no soportado todavía: ${imageProvider}`
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}

async function generateWithPollinations({
  res,
  prompt,
  model,
  apiKey,
  width,
  height
}) {
  const encodedPrompt = encodeURIComponent(prompt);

  const params = new URLSearchParams({
    model: model || "flux",
    width: String(width || 1024),
    height: String(height || 1024),
    seed: "-1",
    safe: "true"
  });

  const url = `https://gen.pollinations.ai/image/${encodedPrompt}?${params.toString()}`;

  const headers = {};

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers
  });

  if (!response.ok) {
    const errorText = await response.text();

    return res.status(response.status).json({
      error: errorText || "Error generando imagen con Pollinations",
      provider: "pollinations",
      model,
      url
    });
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64Image = buffer.toString("base64");

  return res.status(200).json({
    text: "Imagen generada con Pollinations.",
    image: base64Image,
    mimeType: contentType,
    provider: "pollinations",
    model,
    url
  });
}

async function generateWithGemini({
  res,
  prompt,
  aiConfig,
  referenceImages
}) {
  const apiKey = aiConfig?.apiKey || aiConfig?.imageApiKey || "";
  const model = aiConfig?.imageModel || "gemini-3.1-flash-image";

  if (!apiKey) {
    return res.status(400).json({
      error: "Falta la API Key de Gemini para imagen"
    });
  }

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
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
      provider: "gemini",
      model,
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
      provider: "gemini",
      model,
      raw: data
    });
  }

  return res.status(200).json({
    text,
    image,
    mimeType,
    provider: "gemini",
    model
  });
}
