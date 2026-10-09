import type { CheckRequest, Recipient } from "./schema";

// 受け取る人物の候補。毎回ランダムに3人選ぶので、同じ文章でも反応が変わる。
const PERSONAS: Record<Recipient, string[]> = {
  顧客: [
    "几帳面な情シス課長",
    "忙しすぎる事業部長",
    "前任者と比べがちな担当者",
    "社内調整に疲れた窓口担当",
    "決裁権のある無口な役員",
  ],
  上司: [
    "部下思いだが心配性な課長",
    "数字にしか興味がない部長",
    "昭和の香りがする本部長",
    "Slackの既読が異常に早いマネージャー",
    "会議続きで3行しか読まない上司",
  ],
  後輩: [
    "真面目すぎて全部抱え込む新人",
    "絵文字で感情を表す2年目",
    "言われたことは完璧にやる中途社員",
    "怒られていないか常に気にする後輩",
  ],
  他部署: [
    "自部署の仕事で手一杯の経理担当",
    "ルールに厳しい法務",
    "「それうちの担当ですか?」が口癖の総務",
    "協力的だがレスが遅い営業",
  ],
  社外パートナー: [
    "納期に追われる協力会社のPM",
    "契約範囲に敏感な営業担当",
    "技術にしか興味がないエンジニア",
    "丁寧だが本音が読めない窓口",
  ],
};

export function pickPersonas(recipient: Recipient, count = 3): string[] {
  const pool = [...PERSONAS[recipient]];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export const SYSTEM_PROMPT = `あなたは「送信前の炎上チェッカー」です。ビジネス文章が相手にどう受け取られるかを、ユーモアを交えつつ実務的に診断します。

ルール:
- 炎上度(score)は文章の実際のリスクに基づいて正直に付ける。問題のない文章は1〜2にする。面白さのために盛らない。
- reactions はユーモア担当。指定された人物になりきり、リアルで少しクスッとする反応と心の声を書く。誹謗中傷や差別的な表現はしない。
- risky_phrases は実務担当。原文に実際に含まれる表現だけを抜き出す。問題がなければ空配列。
- rewrites は4トーン(やわらか / ビジネス標準 / 簡潔 / 土下座)を1つずつ。「土下座」はネタとして大げさに謝り倒してよいが、それ以外の3つはそのまま送れる品質にする。
- 元の文章の事実関係(日時・金額・依頼内容)は変えない。`;

export function buildUserPrompt(req: CheckRequest): string {
  const personas = pickPersonas(req.recipient);
  return `送り先: ${req.recipient}
媒体: ${req.channel}
反応予測で演じる人物: ${personas.join(" / ")}

チェックする文章:
"""
${req.message}
"""`;
}
