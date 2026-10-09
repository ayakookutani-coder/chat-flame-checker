import type { CheckRequest, CheckResult } from "./schema";

// ANTHROPIC_API_KEY が無いときに返すダミー結果。画面の確認用。
export function mockResult(req: CheckRequest): CheckResult {
  const head = req.message.slice(0, 20);
  return {
    score: 3,
    label: "（デモ）くすぶり中",
    summary: `デモモードの結果です。.env.local に ANTHROPIC_API_KEY を設定すると、${req.recipient}向けの本物の診断が出ます。`,
    reactions: [
      {
        persona: "会議続きで3行しか読まない上司",
        reaction: "了解。で、結論は?",
        inner_voice: "1行目で要件を言ってほしい…",
        ignore_rate: 42,
      },
      {
        persona: "几帳面な情シス課長",
        reaction: "念のため確認ですが、期限はいつでしょうか。",
        inner_voice: "期限が書いてない依頼は依頼じゃない",
        ignore_rate: 10,
      },
      {
        persona: "Slackの既読が異常に早いマネージャー",
        reaction: "👀",
        inner_voice: "既読はつけた。返事は明日",
        ignore_rate: 87,
      },
    ],
    risky_phrases: [
      {
        phrase: head,
        reason: "（デモ）ここは本番ではAIが危ない言い回しを指摘します",
        suggestion: "（デモ）言い換え案がここに入ります",
      },
    ],
    rewrites: [
      { tone: "やわらか", text: `（デモ）${req.message}` },
      { tone: "ビジネス標準", text: `（デモ）${req.message}` },
      { tone: "簡潔", text: `（デモ）${req.message}` },
      { tone: "土下座", text: `（デモ）誠に、誠に申し訳ございません。${req.message}` },
    ],
  };
}
