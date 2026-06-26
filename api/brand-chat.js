export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const {
    apiKey,
    aiConfig,
    brandName,
    currentProfile,
    messages
  } = req.body;

  const provider = aiConfig?.textProvider || aiConfig?.provider || "gemini";
  const finalApiKey = aiConfig?.textApiKey || aiConfig?.apiKey || apiKey;
  const textModel = aiConfig?.textModel || "gemini-2.5-flash";

  if (!finalApiKey) {
    return res.status(400).json({
      error: "Falta la API Key"
    });
  }

  if (!brandName) {
    return res.status(400).json({
      error: "Falta el nombre de la marca"
    });
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: "No se recibieron mensajes"
    });
  }

  try {
    const lastMessages = messages.slice(-6);

    const conversationText = lastMessages
      .map((msg) => {
        const role = msg.role === "assistant" ? "IA" : "Usuario";
        return `${role}: ${trimText(msg.content, 900)}`;
      })
      .join("\n\n");

    const compactProfile = trimText(currentProfile || "", 4500);

    const prompt = `
Actuá como estratega de marca y director creativo.

Tu trabajo es ayudar al usuario a construir un perfil de marca y detectar qué información o fotos hacen falta para generar una imagen publicitaria.

Marca:
${brandName}

Perfil actual de marca resumido:
${compactProfile || "Todavía no hay perfil de marca definido."}

Última conversación:
${conversationText}

Reglas:
- Respondé en español.
- Sé claro, práctico y breve.
- No pidas todo a la vez.
- Hacé una sola pregunta principal por mensaje.
- Si es un producto, pedí foto del producto.
- Si es un servicio, preguntá si tiene un entregable visual: web, app, diseño, resultado, espacio, captura o antes/después.
- Si es campaña, preguntá objetivo, público y mensaje principal.
- Si es marca institucional, preguntá sensación a transmitir y pedí logo/manual si falta.
- No inventes datos.
- Conservá lo importante del perfil anterior.
- Si ya hay suficiente información, readyToGenerate puede ser true.

Devolvé únicamente JSON válido con esta estructura:

{
  "reply": "respuesta conversacional breve para el usuario",
  "updatedProfile": "perfil de marca actualizado y resumido",
  "detectedType": "producto | servicio | marca institucional | campaña | evento | otro | no especificado",
  "needsVisualAssets": true,
  "assetRequests": [
    {
      "type": "product_photo | packaging_photo | logo | screenshot | service_result | place_photo | person_photo | reference_image | other",
      "label": "archivo que debería subir",
      "reason": "por qué se necesita"
    }
  ],
  "missingInfo": ["dato faltante 1", "dato faltante 2"],
  "nextQuestion": "una sola pregunta concreta para avanzar",
  "readyToGenerate": false
}

No uses markdown.
No agregues texto fuera del JSON.
`;

    let rawText = "";

    if (provider === "gemini") {
      rawText = await callGeminiText({
        apiKey: finalApiKey,
        model: textModel,
        prompt
      });
    } else if (provider === "groq") {
      rawText = await callGroqText({
        apiKey: finalApiKey,
        model: textModel,
        prompt
      });
    } else {
      return res.status(400).json({
        error: `Proveedor no soportado todavía: ${provider}`
      });
    }

    if (!rawText) {
      return res.status(500).json({
        error: "La IA respondió, pero no devolvió texto",
        provider,
        model: textModel
      });
    }

    let cleanedText = rawText.trim();

    cleanedText = cleanedText
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(cleanedText);
    } catch (jsonError) {
      return res.status(500).json({
        error: "La IA respondió, pero no devolvió un JSON válido",
        provider,
        model: textModel,
        rawText
      });
    }

    const updatedProfile = trimText(
      parsed.updatedProfile || currentProfile || "",
      5500
    );

    return res.status(200).json({
      reply: parsed.reply || "Perfecto, seguí contándome más sobre la marca.",
      updatedProfile,
      detectedType: parsed.detectedType || "no especificado",
      needsVisualAssets: Boolean(parsed.needsVisualAssets),
      assetRequests: Array.isArray(parsed.assetRequests) ? parsed.assetRequests : [],
      missingInfo: Array.isArray(parsed.missingInfo) ? parsed.missingInfo : [],
      nextQuestion: parsed.nextQuestion || "",
      readyToGenerate: Boolean(parsed.readyToGenerate),
      provider,
      model: textModel
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}

function trimText(text, maxLength) {
  const value = String(text || "");

  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength) + "\n\n[Contenido resumido por límite de tokens]";
}

async function callGeminiText({ apiKey, model, prompt }) {
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
    throw new Error(data.error?.message || "Error en Gemini");
  }

  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callGroqText({ apiKey, model, prompt }) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "Respondé únicamente JSON válido. No uses markdown. No agregues explicación fuera del JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.4,
      max_tokens: 900,
      response_format: {
        type: "json_object"
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Error en Groq");
  }

  return data?.choices?.[0]?.message?.content || "";
}
