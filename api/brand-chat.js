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
    const lastMessages = messages.slice(-5);

    const conversationText = lastMessages
      .map((msg) => {
        const role = msg.role === "assistant" ? "IA" : "Usuario";
        return `${role}: ${trimText(msg.content, 650)}`;
      })
      .join("\n\n");

    const compactProfile = getSmartProfileSummary(currentProfile || "");

    const latestUserMessage = [...messages]
      .reverse()
      .find((msg) => msg.role === "user")?.content || "";

    const prompt = `
Actuá como estratega de marca, director creativo y asistente de producción visual.

Tu tarea es ayudar al usuario a preparar una imagen publicitaria respetando el perfil de marca cargado.

MARCA:
${brandName}

PERFIL DE MARCA CARGADO:
${compactProfile || "Todavía no hay perfil de marca definido."}

ÚLTIMO MENSAJE DEL USUARIO:
${latestUserMessage}

ÚLTIMA CONVERSACIÓN:
${conversationText}

INSTRUCCIONES IMPORTANTES:
- Usá activamente la información del perfil de marca cargado.
- Si el perfil menciona colores, tono, producto, claims, arquetipos o valores, usalos en tu respuesta.
- No respondas genérico si el perfil ya tiene información útil.
- Respondé en español.
- Sé breve, claro y práctico.
- Hacé una sola pregunta principal al final.
- No pidas todo a la vez.
- No inventes datos que no estén en el perfil o en la conversación.

REGLAS DE DETECCIÓN:

Si el usuario menciona:
"lata", "bebida", "energética", "packaging", "envase", "producto", "sabor", "presentar una lata"
entonces detectedType debe ser "producto".

Si es producto:
- Pedí una foto o referencia visual del producto.
- Si el producto tiene sabores o variantes, preguntá cuál se quiere mostrar.
- Si el perfil de marca tiene colores o sabores, mencioná los más importantes.
- No preguntes de forma genérica "cuál es el diseño"; pedí algo accionable:
  "subí una foto de la lata o decime qué sabor querés mostrar".

Si es servicio:
- Preguntá si tiene un entregable visual: web, app, diseño, resultado, espacio, captura, antes/después.
- Si lo tiene, pedí foto/captura/referencia.

Si es campaña:
- Preguntá objetivo, público y mensaje principal.

Si es marca institucional:
- Preguntá sensación a transmitir y pedí logo/manual si falta.

CRITERIO PARA readyToGenerate:
- true si ya hay suficiente información para generar una imagen razonable.
- false si falta una foto/referencia clave del producto o falta el objetivo de la pieza.

Para productos físicos, si no hay foto o referencia visual del producto, readyToGenerate debe ser false.

Devolvé únicamente JSON válido con esta estructura exacta:

{
  "reply": "respuesta conversacional breve para el usuario, usando datos del perfil de marca",
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
      5000
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

  return value.slice(0, maxLength) + "\n\n[Contenido recortado por límite de tokens]";
}

function getSmartProfileSummary(profile) {
  const value = String(profile || "").trim();

  if (!value) {
    return "";
  }

  if (value.length <= 3800) {
    return value;
  }

  const lower = value.toLowerCase();

  const importantKeywords = [
    "resumen ejecutivo",
    "descripción general",
    "propósito",
    "propuesta de valor",
    "beneficios funcionales",
    "beneficios emocionales",
    "arquetipos",
    "sistema visual",
    "paleta",
    "colores",
    "tipografía",
    "producto",
    "voz",
    "tono",
    "claims",
    "prompt base"
  ];

  const chunks = [];

  chunks.push(value.slice(0, 1800));

  importantKeywords.forEach((keyword) => {
    const index = lower.indexOf(keyword);

    if (index !== -1) {
      const start = Math.max(0, index - 250);
      const end = Math.min(value.length, index + 900);
      const fragment = value.slice(start, end);

      if (!chunks.some((chunk) => chunk.includes(fragment.slice(0, 120)))) {
        chunks.push(fragment);
      }
    }
  });

  const joined = chunks.join("\n\n---\n\n");

  return trimText(joined, 4200);
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
      temperature: 0.35,
      max_tokens: 850,
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
