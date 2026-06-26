export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const {
    aiConfig,
    brandName,
    manualText
  } = req.body;

  const provider = aiConfig?.textProvider || aiConfig?.provider || "groq";
  const apiKey = aiConfig?.textApiKey || aiConfig?.apiKey || "";
  const model = aiConfig?.textModel || "llama-3.1-8b-instant";

  if (!apiKey) {
    return res.status(400).json({
      error: "Falta la API Key de texto"
    });
  }

  if (!brandName) {
    return res.status(400).json({
      error: "Falta el nombre de la marca"
    });
  }

  if (!manualText) {
    return res.status(400).json({
      error: "Falta el contenido del manual"
    });
  }

  try {
    const trimmedManual = trimText(manualText, 8500);

    const prompt = `
Actuá como especialista senior en branding, dirección creativa y estrategia visual.

Vas a recibir el contenido textual de un manual de marca.

Tu tarea es convertir ese contenido en un PERFIL DE MARCA OPTIMIZADO PARA IA, claro, resumido y útil para generar imágenes publicitarias.

Marca:
${brandName}

Contenido del manual:
${trimmedManual}

Necesito que extraigas y ordenes la información más importante.

El resultado debe servir para que un chat y un generador de imágenes entiendan la marca rápidamente.

Respondé en español.

No inventes datos.
Si algo no está claro, escribí "no especificado".
Priorizá información útil para generar imágenes:
- producto
- propuesta de valor
- personalidad
- tono
- colores
- estilo visual
- público
- claims
- restricciones
- ideas visuales
- prompt base

Devolvé únicamente texto plano con esta estructura:

PERFIL DE MARCA OPTIMIZADO PARA IA

1. RESUMEN EJECUTIVO
Resumen corto de la marca en 5 a 8 líneas.

2. QUÉ ES LA MARCA
Descripción clara.

3. PRODUCTO O SERVICIO
Qué vende/ofrece la marca.

4. DIFERENCIALES PRINCIPALES
Lista de diferenciales.

5. PROPÓSITO DE MARCA
Propósito resumido.

6. MISIÓN Y VISIÓN
Resumen si aparece en el manual.

7. PERSONALIDAD Y ARQUETIPOS
Arquetipos, actitud y personalidad.

8. TONO DE VOZ
Cómo habla la marca.

9. PÚBLICO OBJETIVO
A quién le habla.

10. SISTEMA VISUAL
Colores, tipografías, estilo gráfico, composición y logo.

11. COLORES IMPORTANTES
Colores con códigos hex si aparecen.

12. PRODUCTOS, FORMATOS Y VARIANTES
Sabores, modelos, formatos, tamaños, packaging, etc.

13. CLAIMS Y FRASES DE MARCA
Claims existentes y propuestas si aparecen.

14. QUÉ DEBE TRANSMITIR UNA IMAGEN DE LA MARCA
Sensaciones, estilo, energía, contexto.

15. QUÉ EVITAR
Restricciones o cosas que no deben hacerse.

16. PROMPT BASE PARA GENERAR IMÁGENES
Un prompt base claro para generar piezas visuales de la marca.

17. RESUMEN ULTRACORTO PARA GROQ
Resumen de máximo 900 caracteres con lo esencial.
`;

    let result = "";

    if (provider === "groq") {
      result = await callGroqText({
        apiKey,
        model,
        prompt
      });
    } else if (provider === "gemini") {
      result = await callGeminiText({
        apiKey,
        model,
        prompt
      });
    } else {
      return res.status(400).json({
        error: `Proveedor de texto no soportado: ${provider}`
      });
    }

    if (!result) {
      return res.status(500).json({
        error: "La IA no devolvió análisis del manual",
        provider,
        model
      });
    }

    return res.status(200).json({
      brandProfile: result,
      provider,
      model
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

  return value.slice(0, maxLength) + "\n\n[Texto recortado por límite de tokens]";
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
          content: "Sos un especialista senior en branding. Respondé en español, en texto plano, claro y ordenado."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.35,
      max_tokens: 1800
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Error en Groq");
  }

  return data?.choices?.[0]?.message?.content || "";
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
