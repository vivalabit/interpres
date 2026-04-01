import cors from "cors";
import express from "express";
import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

loadEnvFile();

const PORT = process.env.PORT || 8787;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini"; // Replace with another Responses API model if needed.
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 20000);

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY environment variable.");
  process.exit(1);
}

const app = express();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "detected_source_language",
    "translation",
    "interesting_points",
    "simple_explanation",
    "speakable_explanation"
  ],
  properties: {
    detected_source_language: {
      type: "string"
    },
    translation: {
      type: "string"
    },
    interesting_points: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "string"
      }
    },
    simple_explanation: {
      type: "string"
    },
    speakable_explanation: {
      type: "string"
    }
  }
};

app.use(
  cors({
    origin: true
  })
);
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/translate-explain", async (req, res) => {
  const text = normalizeText(req.body?.text);
  const targetLanguage = normalizeText(req.body?.targetLanguage) || "English";
  const explanationLanguage =
    normalizeText(req.body?.explanationLanguage) || targetLanguage || "English";

  if (!text) {
    res.status(400).json({ error: "Field 'text' is required." });
    return;
  }

  if (text.length > 300) {
    res.status(400).json({ error: "Text must be 300 characters or fewer." });
    return;
  }

  try {
    console.log(
      `[translate] start model=${MODEL} textLength=${text.length} target=${targetLanguage} explanation=${explanationLanguage}`
    );

    const response = await withTimeout(
      openai.responses.create({
        model: MODEL,
        max_output_tokens: 350,
        instructions: [
          "You are a translation and explanation assistant.",
          "Determine the source language of the input text.",
          "Translate the text into the requested target language.",
          "Write exactly 3 short, interesting, informative points about the meaning or context of the text.",
          "Explain the text simply in the requested explanation language.",
          "If the text is one word or a very short phrase, keep the explanation especially simple and concrete.",
          "Prepare a natural speakable explanation for browser text-to-speech in the explanation language.",
          "Return only valid JSON that matches the provided schema."
        ].join(" "),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildPrompt({ text, targetLanguage, explanationLanguage })
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "translate_explain_response",
            strict: true,
            schema: responseSchema
          }
        }
      }),
      OPENAI_TIMEOUT_MS,
      "OpenAI request timed out."
    );

    const rawOutput = extractOutputText(response);
    let parsed;

    try {
      parsed = JSON.parse(rawOutput);
    } catch (error) {
      console.error("Failed to parse model JSON:", rawOutput);
      res.status(502).json({ error: "OpenAI returned invalid JSON." });
      return;
    }

    const validated = validateModelPayload(parsed);
    console.log("[translate] success");
    res.json(validated);
  } catch (error) {
    console.error("OpenAI request failed:", error);

    if (error instanceof Error && error.message === "OpenAI request timed out.") {
      res.status(504).json({
        error: "OpenAI API timed out.",
        details: `No response within ${OPENAI_TIMEOUT_MS} ms.`
      });
      return;
    }

    if (error?.status) {
      res.status(502).json({
        error: "OpenAI API request failed.",
        details: error.message
      });
      return;
    }

    res.status(500).json({
      error: "Unexpected backend error.",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Translation backend listening on http://localhost:${PORT}`);
});

function buildPrompt({ text, targetLanguage, explanationLanguage }) {
  return [
    `Text: ${text}`,
    `Target language: ${targetLanguage}`,
    `Explanation language: ${explanationLanguage}`,
    "Return JSON only."
  ].join("\n");
}

function extractOutputText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const contentTexts = [];
  for (const item of response.output || []) {
    for (const contentItem of item.content || []) {
      if (contentItem.type === "output_text" && typeof contentItem.text === "string") {
        contentTexts.push(contentItem.text);
      }
    }
  }

  if (!contentTexts.length) {
    throw new Error("OpenAI response did not contain output text.");
  }

  return contentTexts.join("").trim();
}

function validateModelPayload(payload) {
  const result = {
    detected_source_language: normalizeText(payload?.detected_source_language),
    translation: normalizeText(payload?.translation),
    interesting_points: Array.isArray(payload?.interesting_points)
      ? payload.interesting_points.map((item) => normalizeText(item))
      : [],
    simple_explanation: normalizeText(payload?.simple_explanation),
    speakable_explanation: normalizeText(payload?.speakable_explanation)
  };

  const isValid =
    result.detected_source_language &&
    result.translation &&
    result.simple_explanation &&
    result.speakable_explanation &&
    result.interesting_points.length === 3 &&
    result.interesting_points.every(Boolean);

  if (!isValid) {
    throw new Error("Model returned JSON with missing required fields.");
  }

  return result;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

function loadEnvFile() {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);
  const envPath = path.join(currentDir, ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const envContent = fs.readFileSync(envPath, "utf8");
  for (const rawLine of envContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
