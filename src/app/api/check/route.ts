import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CheckRequestSchema, CheckResultSchema, type CheckResult } from "@/lib/schema";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/prompt";
import { mockResult } from "@/lib/mock";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalize(result: CheckResult): CheckResult {
  return {
    ...result,
    score: clamp(result.score, 1, 5),
    reactions: result.reactions.map((r) => ({ ...r, ignore_rate: clamp(r.ignore_rate, 0, 100) })),
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = CheckRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が不正です" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ result: mockResult(parsed.data), mock: true });
  }

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: {
        effort: "low",
        format: zodOutputFormat(CheckResultSchema),
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(parsed.data) }],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ error: "この文章は診断できませんでした。内容を変えて試してください。" }, { status: 422 });
    }
    if (!response.parsed_output) {
      return Response.json({ error: "AIの応答を読み取れませんでした。もう一度試してください。" }, { status: 502 });
    }
    return Response.json({ result: normalize(response.parsed_output), mock: false });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "APIキーが無効です。.env.local を確認してください。" }, { status: 500 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "混み合っています。少し待ってから試してください。" }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      return Response.json({ error: `AI の呼び出しに失敗しました (${err.status ?? "network"})` }, { status: 502 });
    }
    throw err;
  }
}
