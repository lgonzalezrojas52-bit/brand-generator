export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const {
    url,
    aiConfig,
    brandName
  } = req.body;

  if (!url) {
    return res.status(400).json({
      error: "Falta la URL del sitio web"
    });
  }

  if (!brandName) {
    return res.status(400).json({
      error: "Falta el nombre de la marca"
    });
  }

  const provider = aiConfig?.textProvider || aiConfig?.provider || "groq";
  const apiKey = aiConfig?.textApiKey || aiConfig?.apiKey || "";
  const model = aiConfig?.textModel || "llama-3.1-8b-instant";

  if (!apiKey) {
    return res.status(400).json({
      error: "Falta la API Key de texto"
    });
  }

  try {
    // 1. Validar y limpiar URL
    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = "https://" + targetUrl;
    }

    // 2. Fetch HTML de la web
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      return res.status(400).json({
        error: `No se pudo acceder a la web (HTTP ${response.status}). Verificá que sea una URL pública y válida.`
      });
    }

    const html = await response.text();
    const websiteText = extractTextFromHtml(html);

    if (!websiteText || websiteText.length < 50) {
      return res.status(400).json({
        error: "No se pudo extraer suficiente contenido de texto del sitio web. ¿Tiene protección contra scrapers o es una app de página única vacía?"
      });
    }

    const trimmedText = trimText(websiteText, 8500);

    // 3. Crear prompt para analizar el sitio web
    const prompt = `
Actuá como especialista senior en branding, dirección creativa y estrategia visual.

Vas a recibir el contenido textual extraído de la página web de la marca.

Tu tarea es convertir ese contenido en un PERFIL DE MARCA OPTIMIZADO PARA IA, claro, resumido y útil para generar imágenes publicitarias.

Marca:
${brandName}

Sitio Web de Origen:
${targetUrl}

Contenido del Sitio Web:
${trimmedText}

Necesito que extraigas y ordenes la información más importante. El resultado debe servir para que un chat y un generador de imágenes entiendan la marca rápidamente.

Respondé en español.

Priorizá información útil para generar imágenes:
- qué vende/ofrece (producto o servicio)
- propuesta de valor
- tono y personalidad
- estilo visual y colores sugeridos por los textos
- público objetivo
- claims o slogans que aparezcan

Devolvé únicamente texto plano con esta estructura:

PERFIL DE MARCA OPTIMIZADO DESDE SITIO WEB

1. RESUMEN EJECUTIVO (Descripción corta)
2. QUÉ ES LA MARCA Y PROPUESTA DE VALOR
3. PRODUCTOS O SERVICIOS QUE DETALLA
4. TONO DE COMUNICACIÓN Y PERSONALIDAD
5. COLORES Y ESTILO VISUAL SUGERIDOS
6. PÚBLICO OBJETIVO
7. CLAIMS Y SLOGANS IDENTIFICADOS
8. PROMPT BASE PARA GENERAR IMÁGENES
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
    } else if (provider === "openai") {
      result = await callOpenAIText({
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
        error: "La IA no devolvió el análisis del sitio web",
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
      error: `Error al analizar la web: ${error.message}`
    });
  }
}

function extractTextFromHtml(html) {
  let text = String(html || "");
  // Remover script y style
  text = text.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
  text = text.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '');
  // Remover comentarios
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  // Reemplazar saltos de bloque
  text = text.replace(/<\/div>|<\/p>|<\/h[1-6]>|<\/li>|<\/tr>/gi, '\n');
  // Remover tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Colapsar espacios
  text = text.replace(/\s+/g, ' ').trim();
  // Entidades básicas
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  return text;
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

async function callOpenAIText({ apiKey, model, prompt }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
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
    throw new Error(data.error?.message || "Error en OpenAI");
  }
  return data?.choices?.[0]?.message?.content || "";
}
