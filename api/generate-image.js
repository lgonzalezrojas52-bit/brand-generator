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

    if (imageProvider === "openai") {
      return await generateWithOpenAI({
        res,
        prompt,
        model: imageModel,
        apiKey: imageApiKey,
        width,
        height
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
  if (apiKey) {
    return await generateWithPollinationsPost({
      res,
      prompt,
      model,
      apiKey,
      width,
      height
    });
  }

  return await generateWithPollinationsPublicUrl({
    res,
    prompt,
    model,
    width,
    height
  });
}

async function generateWithPollinationsPublicUrl({
  res,
  prompt,
  model,
  width,
  height
}) {
  const shortPrompt = buildShortPrompt(prompt);

  const encodedPrompt = encodeURIComponent(shortPrompt);

  const params = new URLSearchParams({
    model: model || "flux",
    width: String(width || 1024),
    height: String(height || 1024),
    seed: String(Math.floor(Math.random() * 999999)),
    nologo: "true",
    safe: "true"
  });

  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "brand-generator/1.0"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();

    return res.status(response.status).json({
      error: errorText || "Error generando imagen con Pollinations público",
      provider: "pollinations",
      model,
      mode: "public-url",
      url
    });
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64Image = buffer.toString("base64");

  return res.status(200).json({
    text: "Imagen generada con Pollinations sin API Key.",
    image: base64Image,
    mimeType: contentType,
    provider: "pollinations",
    model,
    mode: "public-url"
  });
}

async function generateWithPollinationsPost({
  res,
  prompt,
  model,
  apiKey,
  width,
  height
}) {
  const cleanPrompt = String(prompt || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);

  const size = `${width || 1024}x${height || 1024}`;

  const response = await fetch("https://gen.pollinations.ai/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      prompt: cleanPrompt,
      model: model || "flux",
      n: 1,
      size,
      quality: "medium",
      response_format: "b64_json",
      safe: true
    })
  });

  const data = await response.json().catch(async () => {
    const text = await response.text();
    return {
      error: {
        message: text
      }
    };
  });

  if (!response.ok) {
    return res.status(response.status).json({
      error: data.error?.message || "Error generando imagen con Pollinations",
      provider: "pollinations",
      model,
      mode: "post",
      raw: data
    });
  }

  const image =
    data?.data?.[0]?.b64_json ||
    data?.data?.[0]?.b64 ||
    data?.b64_json ||
    null;

  const imageUrl =
    data?.data?.[0]?.url ||
    data?.url ||
    null;

  if (image) {
    return res.status(200).json({
      text: "Imagen generada con Pollinations.",
      image,
      mimeType: "image/png",
      provider: "pollinations",
      model,
      mode: "post"
    });
  }

  if (imageUrl) {
    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      return res.status(500).json({
        error: "Pollinations devolvió URL, pero no se pudo descargar la imagen",
        provider: "pollinations",
        model,
        imageUrl
      });
    }

    const contentType = imageResponse.headers.get("content-type") || "image/png";
    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString("base64");

    return res.status(200).json({
      text: "Imagen generada con Pollinations.",
      image: base64Image,
      mimeType: contentType,
      provider: "pollinations",
      model,
      mode: "post",
      imageUrl
    });
  }

  return res.status(500).json({
    error: "Pollinations respondió, pero no devolvió imagen",
    provider: "pollinations",
    model,
    raw: data
  });
}

function buildShortPrompt(prompt) {
  const value = String(prompt || "")
    .replace(/\s+/g, " ")
    .trim();

  const brandProfileMatch = value.match(/Brand profile:(.*?)(Detected type:|Requested piece:|User request:)/i);
  const userRequestMatch = value.match(/User request:(.*?)(Text to include in the image:|Reference context:|Visual rules:)/i);
  const textMatch = value.match(/Text to include in the image:(.*?)(Reference context:|Visual rules:)/i);
  const detectedTypeMatch = value.match(/Detected type:(.*?)(Requested piece:|User request:)/i);

  const brandProfile = brandProfileMatch ? brandProfileMatch[1].trim() : "";
  const userRequest = userRequestMatch ? userRequestMatch[1].trim() : value;
  const imageText = textMatch ? textMatch[1].trim() : "";
  const detectedType = detectedTypeMatch ? detectedTypeMatch[1].trim() : "";

  const shortPrompt = `
Professional advertising image for a brand.

Main request:
${userRequest}

Brand context:
${brandProfile}

Detected type:
${detectedType}

Text in image:
${imageText}

Style:
premium commercial design, clean composition, high-quality lighting, modern branding, social media advertising, no watermark, no external brands, legible short text only.
`;

  return shortPrompt
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800);
}

async function generateWithGemini({
  res,
  prompt,
  aiConfig,
  referenceImages
}) {
  const apiKey = aiConfig?.imageApiKey || aiConfig?.apiKey || "";
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

async function generateWithOpenAI({
  res,
  prompt,
  model,
  apiKey,
  width,
  height
}) {
  if (!apiKey) {
    return res.status(400).json({
      error: "Falta la API Key de OpenAI para generar imagen"
    });
  }

  // DALL-E 3 supports 1024x1024, 1024x1792 (vertical), and 1792x1024 (horizontal)
  let size = "1024x1024";

  const w = Number(width || 1024);
  const h = Number(height || 1024);

  if (w > h) {
    size = "1792x1024"; // Landscape
  } else if (h > w) {
    size = "1024x1792"; // Portrait
  }

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || "dall-e-3",
        prompt,
        n: 1,
        size,
        response_format: "b64_json"
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Error en OpenAI (DALL-E)",
        provider: "openai",
        model: model || "dall-e-3",
        raw: data
      });
    }

    const image = data?.data?.[0]?.b64_json;
    const revisedPrompt = data?.data?.[0]?.revised_prompt || "";

    if (!image) {
      return res.status(500).json({
        error: "OpenAI respondió, pero no devolvió los datos de la imagen",
        provider: "openai",
        model: model || "dall-e-3",
        raw: data
      });
    }

    return res.status(200).json({
      text: revisedPrompt ? `Prompt revisado por DALL-E: ${revisedPrompt}` : "Imagen generada correctamente con DALL-E.",
      image,
      mimeType: "image/png",
      provider: "openai",
      model: model || "dall-e-3"
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}

