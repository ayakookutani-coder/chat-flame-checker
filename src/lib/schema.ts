import { z } from "zod";

export const RECIPIENTS = ["顧客", "上司", "後輩", "他部署", "社外パートナー"] as const;
export type Recipient = (typeof RECIPIENTS)[number];

export const CHANNELS = ["メール", "Slack / Teams"] as const;
export type Channel = (typeof CHANNELS)[number];

export const TONES = ["やわらか", "ビジネス標準", "簡潔", "土下座"] as const;

export const CheckRequestSchema = z.object({
  message: z.string().trim().min(1, "文章を入力してください").max(4000, "4000文字以内にしてください"),
  recipient: z.enum(RECIPIENTS),
  channel: z.enum(CHANNELS),
});
export type CheckRequest = z.infer<typeof CheckRequestSchema>;

// Claude に返させる JSON の形。structured outputs で強制する。
export const CheckResultSchema = z.object({
  score: z.number().describe("炎上度。1（平和）〜5（大炎上）の整数"),
  label: z.string().describe("炎上度に付ける一言のキャッチコピー。例:「静かに燃えるタイプ」"),
  summary: z.string().describe("なぜその炎上度なのかを1〜2文で"),
  reactions: z
    .array(
      z.object({
        persona: z.string().describe("受け取る人物のキャラクター名"),
        reaction: z.string().describe("実際に返してきそうな返信や態度"),
        inner_voice: z.string().describe("口には出さない心の声"),
        ignore_rate: z.number().describe("既読スルー確率（0〜100の整数）"),
      }),
    )
    .describe("受け取った人の反応予測。3人分"),
  risky_phrases: z
    .array(
      z.object({
        phrase: z.string().describe("元の文章から抜き出した危険な言い回し（原文そのまま）"),
        reason: z.string().describe("なぜ危ないか"),
        suggestion: z.string().describe("言い換え案"),
      }),
    )
    .describe("危険ワード。問題がなければ空配列"),
  rewrites: z
    .array(
      z.object({
        tone: z.enum(TONES),
        text: z.string().describe("そのトーンで書き直した全文"),
      }),
    )
    .describe("書き直し案。TONES の4種類を1つずつ"),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;
