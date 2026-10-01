// AI provider abstraction. Everything in the codebase calls complete() here, so
// switching AI_PROVIDER never touches the pipeline. Providers: "gemini" (default),
// "claude", "manual".
//
// complete({ system, prompt, maxTokens, search, temperature })
//   search: true  -> the model may use live web search (research passes)
//   search: false -> no tools (used by the fact-checking pass)

const PROVIDER = process.env.AI_PROVIDER || "gemini";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class DailyQuotaError extends Error {
  constructor(msg) { super(msg); this.name = "DailyQuotaError"; }
}

export async function complete({ system, prompt, maxTokens = 8000, search = true, temperature = 0.2, model }) {
  if (PROVIDER === "manual") {
    throw new Error("AI_PROVIDER=manual — automation is paused. Write articles by hand in content/articles/.");
  }
  if (PROVIDER !== "claude" && PROVIDER !== "gemini") {
    throw new Error(`Unknown AI_PROVIDER "${PROVIDER}". Use "gemini", "claude" or "manual".`);
  }
  const waits = [4000, 10000, 30000, 60000, 90000];
  let lastErr;
  const geminiModels = model ? [model] : [
    process.env.GEMINI_MODEL || "gemini-3.8-flash",
    process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite",
    process.env.GEMINI_LEGACY_FALLBACK_MODEL || "gemini-2.5-flash-lite"
  ];
  const models = PROVIDER === "gemini" ? [...new Set(geminiModels)] : [model];
  for (const selectedModel of models) {
    for (let attempt = 0; attempt <= waits.length; attempt++) {
      try {
        return PROVIDER === "claude"
          ? await completeClaude({ system, prompt, maxTokens, search, temperature, model: selectedModel })
          : await completeGemini({ system, prompt, maxTokens, search, temperature, model: selectedModel });
      } catch (err) {
        lastErr = err;
        if (err.name === "DailyQuotaError") {
          if (PROVIDER === "gemini") break;
          throw err;
        }
        if (!err.retryable || attempt === waits.length) break;
        await sleep(waits[attempt]);
      }
    }
  }
  throw lastErr;
}

function httpError(prefix, status, body) {
  if (status === 429 && /RESOURCE_EXHAUSTED|quota|rate.?limit|per day|daily/i.test(body)) return new DailyQuotaError(`${prefix} quota/rate limit exhausted: ${body.slice(0, 500)}`);
  const e = new Error(`${prefix} error ${status}: ${body.slice(0, 500)}`);
  e.retryable = status === 429 || status >= 500;
  return e;
}

async function completeClaude({ system, prompt, maxTokens, search, temperature, model: m }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  const body = {
    model: m || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: maxTokens, temperature, system,
    messages: [{ role: "user", content: prompt }]
  };
  if (search) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw httpError("Claude API", res.status, await res.text().catch(() => ""));
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { text, raw: data };
}

async function completeGemini({ system, prompt, maxTokens, search, temperature, model: m }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const model = m || process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const grounding = search && process.env.GEMINI_GROUNDING === "true";
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature }
  };
  if (grounding) body.tools = [{ googleSearch: {} }];
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw httpError("Gemini API", res.status, await res.text().catch(() => ""));
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text || "").join("\n") || "";
  if (!text.trim()) {
    const e = new Error(`Gemini returned no text (finishReason: ${cand?.finishReason || "unknown"})`);
    e.retryable = true;
    throw e;
  }
  return { text, raw: data };
}
