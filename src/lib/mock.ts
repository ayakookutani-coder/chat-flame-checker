import { pickPersonas } from "./prompt";
import type { CheckRequest, CheckResult, Recipient } from "./schema";

// ANTHROPIC_API_KEY が無いときのデモモード。AI の代わりに簡単なルールで判定する。
// 送り先によって同じ表現でも重さが変わるように、危険ワードごとに送り先別の加点を持たせている。

type Rule = {
  phrase: string;
  reason: string;
  suggestion: string;
  weight: Partial<Record<Recipient, number>> & { base: number };
};

const RULES: Rule[] = [
  {
    phrase: "まだでしょうか",
    reason: "催促のニュアンスが強く、相手を責めているように読める",
    suggestion: "進捗はいかがでしょうか",
    weight: { base: 1, 顧客: 2, 上司: 1, 社外パートナー: 1 },
  },
  {
    phrase: "至急",
    reason: "理由や期限がないと高圧的に聞こえる",
    suggestion: "〇日までにご対応いただけますと助かります",
    weight: { base: 1, 顧客: 2, 他部署: 1, 社外パートナー: 1 },
  },
  {
    phrase: "正直",
    reason: "続く内容が否定的だと、本音をぶつけられた印象になる",
    suggestion: "率直に申し上げますと",
    weight: { base: 1, 顧客: 2, 上司: 1 },
  },
  {
    phrase: "反映されていない",
    reason: "相手の落ち度を断定している",
    suggestion: "反映が漏れている箇所があるかもしれません",
    weight: { base: 1, 顧客: 1, 上司: 1 },
  },
  {
    phrase: "特にないです",
    reason: "投げやりに聞こえ、仕事を放り出した印象を与える",
    suggestion: "引き継ぎ事項は以下のとおりです(なければ「急ぎの対応はありません」)",
    weight: { base: 1, 上司: 2, 後輩: 1 },
  },
  {
    phrase: "休みます",
    reason: "報告だけで、相談や配慮の一言がない",
    suggestion: "お休みをいただきます。ご迷惑をおかけします",
    weight: { base: 0, 上司: 1, 顧客: 1 },
  },
  {
    phrase: "リスケ",
    reason: "直前の日程変更は相手の予定を崩す。社外にはくだけすぎた言い方",
    suggestion: "日程を改めさせていただけますでしょうか",
    weight: { base: 0, 顧客: 2, 社外パートナー: 2, 上司: 1 },
  },
  {
    phrase: "間に合わなかった",
    reason: "理由の説明がなく、言い訳にも開き直りにも見える",
    suggestion: "準備が間に合わず申し訳ありません",
    weight: { base: 1, 顧客: 1, 上司: 1 },
  },
  {
    phrase: "なんで",
    reason: "詰問しているように聞こえる",
    suggestion: "差し支えなければ理由を教えていただけますか",
    weight: { base: 1, 上司: 2, 顧客: 2, 後輩: 1 },
  },
  {
    phrase: "前にも言いましたが",
    reason: "相手を責めるニュアンスが強い",
    suggestion: "念のため改めてお伝えしますと",
    weight: { base: 2, 後輩: 1, 顧客: 2 },
  },
];

// くだけた表現は社外だと減点。後輩・社内なら問題なし。
const CASUAL = /[🙏😂😭👍!！]|w$|笑/;
const FORMAL_RECIPIENTS: Recipient[] = ["顧客", "社外パートナー"];

const LABELS = ["", "平和そのもの", "ほぼ無風", "静かにくすぶり中", "燃え広がる予感", "大炎上待ったなし"];

const REACTIONS: Record<number, { reaction: string; inner: string }[]> = {
  1: [
    { reaction: "承知しました!", inner: "分かりやすい。助かる" },
    { reaction: "ありがとうございます🙆", inner: "特に何も思わない、良い意味で" },
    { reaction: "了解です", inner: "感じのいい人だな" },
  ],
  2: [
    { reaction: "承知しました。", inner: "ちょっとだけ冷たい…?気のせいか" },
    { reaction: "確認します", inner: "まあ、いつも通りかな" },
    { reaction: "👍", inner: "あとで返そう" },
  ],
  3: [
    { reaction: "確認いたします。", inner: "言い方…" },
    { reaction: "…承知しました", inner: "これ、ちょっと怒ってる?" },
    { reaction: "(既読)", inner: "返信の文面を3回書き直している" },
  ],
  4: [
    { reaction: "大変失礼いたしました。", inner: "そっちにも事情があるのは分かるけど" },
    { reaction: "一度お電話よろしいでしょうか", inner: "文字だと角が立つから電話にしよう" },
    { reaction: "(既読から2時間)", inner: "上司に転送するか迷っている" },
  ],
  5: [
    { reaction: "本件、上長を交えてお話しさせてください。", inner: "スクショ撮った" },
    { reaction: "(CCに部長が追加される)", inner: "これは記録に残すべき" },
    { reaction: "(既読スルー)", inner: "今日はもう返さない" },
  ],
};

type Replacement = [RegExp, string];

// 先頭の挨拶と絵文字は各トーンで付け直すので一旦外す。
const STRIP: Replacement[] = [
  [/^(お疲れ様です|お疲れさまです|おつかれさまです|お世話になっております)[！!。、]?\s*/, ""],
  [/[\p{Extended_Pictographic}\u{FE0F}]/gu, ""],
];

// 口語・くだけた表現 → ビジネス用語。上から順に適用するので、長い表現を先に置く。
const BUSINESS: Replacement[] = [
  [/まだでしょうか/g, "その後の進捗はいかがでしょうか"],
  [/至急対応/g, "恐れ入りますが、お早めのご対応を"],
  [/至急/g, "お早めに"],
  [/正直、?/g, "率直に申し上げますと、"],
  [/反映されていないように見えます/g, "一部反映されていない箇所があるように見受けられます"],
  [/前にも言いましたが、?/g, "念のため改めてお伝えいたしますと、"],
  [/なんで/g, "どのような理由で"],
  [/間に合わなかったので/g, "間に合わず、誠に申し訳ございません。つきましては、"],
  [/リスケで/g, "日程の再調整を"],
  [/リスケ/g, "日程の再調整"],
  [/特にないです/g, "特にございません"],
  [/ないです/g, "ございません"],
  [/すみません|すいません|ごめんなさい|ごめん/g, "申し訳ございません"],
  [/了解です|了解しました|わかりました|分かりました/g, "承知いたしました"],
  [/ちょっと見ました/g, "一通り拝見しました"],
  [/見ました/g, "拝見しました"],
  [/聞きました/g, "伺いました"],
  [/言いました/g, "申し上げました"],
  [/もらえると助かります/g, "いただけますと幸いです"],
  [/もらえますか|もらえませんか/g, "いただけますでしょうか"],
  [/お願いできますか/g, "お願いできますでしょうか"],
  [/ください/g, "いただけますでしょうか"],
  [/お願いします/g, "お願いいたします"],
  [/確認します/g, "確認いたします"],
  [/送ります/g, "お送りいたします"],
  [/休みます/g, "休暇をいただきます"],
  [/どうですか/g, "いかがでしょうか"],
  [/いいですか/g, "よろしいでしょうか"],
  [/できません/g, "いたしかねます"],
  [/今日/g, "本日"],
  [/あとで/g, "後ほど"],
  [/さっき/g, "先ほど"],
  [/ちょっと/g, "少々"],
  [/けど/g, "が"],
  [/[！!？?]/g, "。"],
];

// やわらか:敬語にしすぎず、責める感じだけ消す。
const SOFT: Replacement[] = [
  [/まだでしょうか/g, "その後いかがでしょうか"],
  [/至急対応/g, "もし可能でしたら早めに対応"],
  [/至急/g, "できれば早めに"],
  [/正直、?/g, "個人的な印象なのですが、"],
  [/反映されていないように見えます/g, "反映されていない部分があるかも…と思いました"],
  [/前にも言いましたが、?/g, "念のためですが、"],
  [/なんで/g, "どうして"],
  [/特にないです/g, "急ぎのものはありません"],
  [/リスケ/g, "日程の変更"],
  [/もらえますか[？?]?/g, "お願いできると助かります。"],
  [/けど/g, "が"],
];

// 簡潔:前置き・クッションを削る。
const TRIM: Replacement[] = [
  [/本日の定例ですが、?/g, "本日の定例は、"],
  [/(率直に申し上げますと|恐れ入りますが|念のため改めてお伝えいたしますと)、?/g, ""],
  [/誠に申し訳ございません。つきましては、/g, "申し訳ございません。"],
];

const apply = (text: string, rules: Replacement[]) => rules.reduce((t, [re, to]) => t.replace(re, to), text);

function rewrites(message: string, recipient: Recipient): CheckResult["rewrites"] {
  const body = apply(message.trim(), STRIP).trim();
  const business = apply(body, BUSINESS);
  const external = FORMAL_RECIPIENTS.includes(recipient);
  const opener = external ? "いつもお世話になっております。" : "お疲れ様です。";
  const closer = /お願い(いたします|申し上げます)。?$/.test(business)
    ? ""
    : external
      ? "\n何卒よろしくお願い申し上げます。"
      : "\nよろしくお願いいたします。";

  return [
    {
      tone: "やわらか",
      text: `お疲れさまです。お忙しいところすみません。\n${apply(body, SOFT)}\nご無理のない範囲で大丈夫ですので、よろしくお願いします。`,
    },
    { tone: "ビジネス標準", text: `${opener}\n${business}${closer}` },
    { tone: "簡潔", text: apply(business, TRIM) },
    {
      tone: "土下座",
      text: `このたびは誠に、誠に申し訳ございません。\n${business}\n本来であれば直接お伺いし、地面に額をこすりつけてお詫びすべきところ、文面でのご連絡となりますことを重ねてお詫び申し上げます。`,
    },
  ];
}

export function mockResult(req: CheckRequest): CheckResult {
  const hits = RULES.filter((r) => req.message.includes(r.phrase));
  let points = hits.reduce((sum, r) => sum + r.weight.base + (r.weight[req.recipient] ?? 0), 0);

  const casual = CASUAL.test(req.message);
  if (casual && FORMAL_RECIPIENTS.includes(req.recipient)) points += 2;
  if (req.channel === "メール" && casual) points += 1;

  const score = Math.min(5, Math.max(1, 1 + Math.ceil(points / 2)));
  const pool = REACTIONS[score];

  return {
    score,
    label: `（デモ）${LABELS[score]}`,
    summary:
      hits.length === 0 && !casual
        ? `${req.recipient}宛てとして目立った危険表現は見つかりませんでした。(デモモード:ルールで簡易判定しています)`
        : `${req.recipient}宛てだと、${hits.map((h) => `「${h.phrase}」`).join("")}${casual ? "くだけた表現" : ""}が引っかかります。(デモモード:ルールで簡易判定しています)`,
    reactions: pickPersonas(req.recipient).map((persona, i) => ({
      persona,
      reaction: pool[i % pool.length].reaction,
      inner_voice: pool[i % pool.length].inner,
      ignore_rate: Math.min(100, score * 15 + Math.floor(Math.random() * 20)),
    })),
    risky_phrases: hits.map(({ phrase, reason, suggestion }) => ({ phrase, reason, suggestion })),
    rewrites: rewrites(req.message, req.recipient),
  };
}
