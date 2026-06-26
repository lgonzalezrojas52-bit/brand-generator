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
    const conversationText = messages
      .map((msg) => {
        const role = msg.role === "assistant" ? "IA" : "Usuario";
        return `${role}: ${msg.content}`;
      })
      .join("\n\n");

    const prompt = `
Actuá como estratega de marca, director creativo, consultor de branding y asistente de producción visual.

Estás ayudando al usuario a construir un perfil de marca completo y, además, a detectar qué archivos visuales necesita subir para que luego otra IA pueda generar imágenes publicitarias, posts, stories, banners y piezas visuales de buena calidad.

Nombre de la marca:
${brandName}

Perfil de marca actual:
${currentProfile || "Todavía no hay perfil de marca definido."}

Conversación hasta ahora:
${conversationText}

Tu tarea tiene 4 partes:

1. Responderle al usuario de manera útil, natural y concreta.
2. Actualizar el perfil de marca acumulado con toda la información nueva.
3. Detectar qué tipo de pieza, marca, producto o servicio está queriendo trabajar.
4. Pedir las fotos, capturas o referencias visuales necesarias, dependiendo del caso.

REGLAS IMPORTANTES DE DIAGNÓSTICO:

Si el usuario habla de un PRODUCTO:
- Pedile foto del producto.
- Si aplica, pedile foto del packaging.
- Preguntá si quiere mostrar el producto solo, en uso, en contexto o con personas.
- Si vende indumentaria, accesorios, comida, bebida, cosmética, tecnología, objetos físicos o similares, siempre conviene pedir foto del producto.
- Si el producto tiene variantes, preguntá cuál quiere mostrar primero.

Si el usuario habla de un SERVICIO:
- Primero preguntá si el servicio entrega algún elemento físico, visual o tangible.
- Ejemplos de entregables visuales:
  - una web
  - una app
  - una tienda online
  - una pieza gráfica
  - una prenda
  - una tarjeta
  - un espacio físico
  - una instalación
  - un antes y después
  - una persona usando el servicio
  - una captura de pantalla
  - un resultado visible
- Si el servicio tiene entregable visual, pedí foto, captura o referencia de ese entregable.
- Si el servicio no tiene entregable visual, pedí referencias de escena, público, estilo visual, contexto o situación que represente el servicio.

Si el usuario habla de una MARCA INSTITUCIONAL:
- Pedí logo o referencia visual si no fue cargado.
- Pedí manual de marca si existe.
- Pedí ejemplos visuales anteriores si tiene.
- Preguntá qué sensación debe transmitir la marca.

Si el usuario habla de una CAMPAÑA:
- Preguntá objetivo de campaña.
- Preguntá público.
- Preguntá oferta o mensaje principal.
- Preguntá si hay producto, persona, espacio o recurso visual que deba aparecer.

Si el usuario habla de un EVENTO:
- Pedí fecha, lugar, estilo del evento y público.
- Preguntá si hay fotos del lugar, speakers, artistas, productos o experiencias.
- Si hay flyer anterior, pedí referencia.

Muy importante:
- No pidas todas las cosas a la vez.
- Hacé una pregunta principal por mensaje.
- Si falta una foto fundamental, pedila claramente.
- No inventes información.
- Si algo no está definido, dejalo como "no especificado".
- Si el usuario corrige algo, actualizá el perfil.
- Si el usuario agrega un dato nuevo, incorporalo.
- No borres información útil del perfil anterior.
- Respondé siempre en español.
- Sé claro, práctico y orientado a producción visual.

CRITERIO PARA readyToGenerate:
- true si ya hay suficiente información para generar una imagen coherente.
- false si todavía falta información clave.

En general, NO debería estar listo para generar si:
- Es un producto y todavía no hay foto/referencia del producto.
- Es un servicio con entregable visual y todavía no hay foto/captura/referencia del entregable.
- No hay estilo visual definido.
- No hay público objetivo.
- No hay objetivo de la pieza.

Puede estar listo para generar si:
- Es una pieza conceptual o institucional y ya hay marca, tono, estilo visual, colores y objetivo.
- Es un servicio intangible y ya hay suficiente escena/contexto para representarlo.
- Es una pieza de campaña con mensaje, público, estilo y objetivo claros.

Devolvé ÚNICAMENTE un JSON válido con esta estructura exacta:

{
  "reply": "respuesta conversacional para el usuario",
  "updatedProfile": "perfil de marca completo y actualizado",
  "detectedType": "producto | servicio | marca institucional | campaña | evento | otro | no especificado",
  "needsVisualAssets": true,
  "assetRequests": [
    {
      "type": "product_photo | packaging_photo | logo | screenshot | service_result | place_photo | person_photo | reference_image | other",
      "label": "nombre claro del archivo que debería subir",
      "reason": "por qué se necesita esa imagen"
    }
  ],
  "missingInfo": ["dato faltante 1", "dato faltante 2"],
  "nextQuestion": "pregunta concreta que conviene hacer ahora",
  "readyToGenerate": false
}

No agregues markdown.
No agregues explicación fuera del JSON.
No uses bloque de código.
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

    return res.status(200).json({
      reply: parsed.reply || "Perfecto, seguí contándome más sobre la marca.",
      updatedProfile: parsed.updatedProfile || currentProfile || "",
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
