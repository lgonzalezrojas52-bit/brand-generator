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
    pages
  } = req.body;

  const finalApiKey = aiConfig?.apiKey || apiKey;
  const provider = aiConfig?.provider || "gemini";
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

  if (!pages || !Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({
      error: "No se recibieron páginas del manual"
    });
  }

  if (provider !== "gemini" && provider !== "openai") {
    return res.status(400).json({
      error: "Por ahora el análisis visual de manual solo soporta Gemini y OpenAI."
    });
  }

  try {
    const prompt = `
Actuá como director creativo senior, especialista en branding, identidad visual y análisis de manuales de marca.

Vas a recibir páginas visuales de un manual de marca. El manual puede estar compuesto principalmente por imágenes, ejemplos visuales, logos, paletas, usos correctos e incorrectos, aplicaciones gráficas y referencias de estilo.

Nombre de la marca:
${brandName}

Tu tarea es analizar las páginas del manual y construir un PERFIL DE MARCA claro, útil y accionable para que luego otra IA pueda generar piezas visuales respetando esta identidad.

Analizá especialmente:
1. Personalidad de marca
2. Tono visual
3. Tono de comunicación
4. Paleta de colores principal y secundaria
5. Tipografías o estilo tipográfico aproximado
6. Uso del logo
7. Estilo gráfico
8. Estilo fotográfico o ilustrativo
9. Composición visual
10. Público objetivo aparente
11. Valores de marca
12. Elementos gráficos recurrentes
13. Qué cosas se deben evitar
14. Reglas importantes del manual
15. Cómo deberían verse piezas para Instagram, stories, anuncios y banners

Respondé en español.

No digas “no puedo ver imágenes”. Sí podés analizarlas.
No inventes datos que no estén sugeridos por el manual.
Si algo no se puede determinar con certeza, aclaralo como “no especificado claramente”.
El resultado debe ser práctico y ordenado.

Devolvé el perfil con esta estructura:

# Perfil de marca: ${brandName}

## 1. Resumen general de la marca

## 2. Personalidad de marca

## 3. Tono de comunicación

## 4. Paleta de colores

## 5. Tipografías y estilo tipográfico

## 6. Uso del logo

## 7. Estilo visual general

## 8. Estilo de imágenes, fotos o ilustraciones

## 9. Composición y diseño

## 10. Elementos gráficos recurrentes

## 11. Público objetivo aparente

## 12. Reglas importantes

## 13. Qué evitar

## 14. Recomendaciones para generar piezas visuales

## 15. Prompt base para futuras imágenes
`;

    const parts = [
      {
        text: prompt
      }
    ];

    for (const page of pages) {
      if (!page || !page.data) continue;

      parts.push({
        inlineData: {
          mimeType: page.mimeType || "image/jpeg",
          data: page.data
        }
      });
    }

    let brandProfile = "";

    if (provider === "gemini") {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent?key=${finalApiKey}`,
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
            ]
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: data.error?.message || "Error analizando el manual de marca",
          provider,
          model: textModel,
          raw: data
        });
      }

      brandProfile = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    } else if (provider === "openai") {
      try {
        brandProfile = await callOpenAIVision({
          apiKey: finalApiKey,
          model: textModel,
          prompt,
          pages
        });
      } catch (err) {
        return res.status(500).json({
          error: err.message,
          provider,
          model: textModel
        });
      }
    } else {
      return res.status(400).json({
        error: `Proveedor no soportado: ${provider}`
      });
    }

    if (!brandProfile) {
      return res.status(500).json({
        error: "Gemini analizó el manual, pero no devolvió un perfil de marca",
        provider,
        model: textModel,
        raw: data
      });
    }

    return res.status(200).json({
      brandProfile,
      provider,
      model: textModel
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}

async function callOpenAIVision({ apiKey, model, prompt, pages }) {
  const messages = [
    {
      role: "system",
      content: "Sos un director creativo senior y especialista en branding. Analizás manuales de marca a partir de imágenes."
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: prompt
        }
      ]
    }
  ];

  for (const page of pages) {
    if (!page || !page.data) continue;
    messages[1].content.push({
      type: "image_url",
      image_url: {
        url: `data:${page.mimeType || "image/jpeg"};base64,${page.data}`
      }
    });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages,
      max_tokens: 2500
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Error en OpenAI Vision");
  }

  return data?.choices?.[0]?.message?.content || "";
}

