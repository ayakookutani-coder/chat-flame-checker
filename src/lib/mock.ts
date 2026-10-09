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
    phrase: "早くして",
    reason: "命令口調で、相手を急かしている",
    suggestion: "お手数ですが、お早めにご対応いただけますでしょうか",
    weight: { base: 2, 顧客: 2, 上司: 2, 社外パートナー: 2, 他部署: 1 },
  },
  {
    phrase: "まだ。",
    reason: "一言だけの催促は、怒っているように読める",
    suggestion: "その後の進捗はいかがでしょうか",
    weight: { base: 1, 顧客: 1, 上司: 1, 社外パートナー: 1 },
  },
  {
    phrase: "まだ？",
    reason: "一言だけの催促は、怒っているように読める",
    suggestion: "その後の進捗はいかがでしょうか",
    weight: { base: 1, 顧客: 1, 上司: 1, 社外パートナー: 1 },
  },
  {
    phrase: "急いで",
    reason: "理由や期限がないと、ただ急かしているだけに聞こえる",
    suggestion: "〇日までにご対応いただけますと助かります",
    weight: { base: 1, 顧客: 2, 上司: 1, 社外パートナー: 1 },
  },
  {
    phrase: "やっといて",
    reason: "丸投げに聞こえ、相手の都合を考えていない印象",
    suggestion: "ご対応をお願いできますでしょうか",
    weight: { base: 1, 顧客: 2, 上司: 2, 他部署: 1, 社外パートナー: 2 },
  },
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

// 乱暴な言い方・暴言・スラング。単語の完全一致では拾いきれないので正規表現で形ごと検出する。
// どの送り先でも重い。ビジネス文では言い換えようがないものは書き直し案から削除する。
type RudeRule = { pattern: RegExp; reason: string; suggestion: string; base: number };

const RUDE: RudeRule[] = [
  { pattern: /おせ[ーぇえ]+(よ|な)?|遅すぎ(る|ん)/, reason: "相手を責める乱暴な言い方", suggestion: "恐れ入りますが、お急ぎいただけますと幸いです", base: 5 },
  { pattern: /ふざけ(ん|る)な|いい加減にして/, reason: "怒りをぶつけている。関係が壊れるレベル", suggestion: "状況について一度ご説明いただけますでしょうか", base: 5 },
  { pattern: /何回(言えば|言った)/, reason: "相手を責め、見下している印象", suggestion: "念のため改めてお伝えいたします", base: 3 },
  { pattern: /使えな(い|ねー)|ありえ(ない|ねー)|あり得ない|うざ(い|っ)?|バカ|ばか|アホ|クソ|くそ/, reason: "暴言。ビジネスの場では一切使えない", suggestion: "(削除する)", base: 5 },
  { pattern: /ちゃんとして/, reason: "上から目線で、相手の仕事を否定している", suggestion: "ご確認のほどよろしくお願いいたします", base: 3 },
  { pattern: /は[？?]/, reason: "威圧的で、喧嘩腰に読める", suggestion: "(削除する)", base: 3 },
  { pattern: /じゃね[ーえ]|だろ(?![うか])|[ぁ-ん]+ー+[よなわ]|ねーよ/, reason: "タメ口・スラング。くだけすぎていて失礼", suggestion: "です・ます調に直す", base: 2 },
  { pattern: /(マジ|まじ)で?/, reason: "くだけすぎた言い方", suggestion: "大変 / 本当に", base: 1 },
];

const RUDE_WEIGHT: Record<Recipient, number> = { 顧客: 2, 社外パートナー: 2, 上司: 2, 他部署: 1, 後輩: 0 };

// くだけた表現は社外だと減点。後輩・社内なら問題なし。
const CASUAL = /[🙏😂😭👍!！]|w$|笑|してよ|だよ|じゃん|でしょ(?!う)/;
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
  [/おせ[ーぇえ]+(よ|な)?[。！!]*|遅すぎ(る|ん)[^。]*[。！!]*/g, "恐れ入りますが、お急ぎいただけますと幸いです。"],
  [/(ふざけ(ん|る)な|いい加減にして(ください|よ)?)[。！!]*/g, "状況について一度ご説明いただけますでしょうか。"],
  [/何回(言えば|言った)[^。？?]*[。？?]?/g, "念のため改めてお伝えいたします。"],
  [/[^。]*(使えな(い|ねー)|ありえ(ない|ねー)|あり得ない|うざ(い|っ)?|バカ|ばか|アホ|クソ|くそ)[^。]*[。！!]*/g, ""],
  [/ちゃんとして[^。]*[。！!]*/g, "ご確認のほどよろしくお願いいたします。"],
  [/は[？?]/g, ""],
  [/(マジ|まじ)で?/g, "大変"],
  [/すげ[ーぇえ]+(な|ね|よ)?[、。！!]*/g, "素晴らしいですね。"],
  [/終わった(の|ん)/g, "完了したのでしょうか"],
  [/じゃん/g, "ではないでしょうか"],
  [/まだでしょうか/g, "その後の進捗はいかがでしょうか"],
  [/まだ(なの|ですか)?[？?！!。]+/g, "その後の進捗はいかがでしょうか。"],
  [/(早く|はやく)して(よ|ね|ください)?[。！!]*/g, "お手数ですが、お早めにご対応いただけますでしょうか。"],
  [/急いで(ください|ね|よ)?[。！!]*/g, "お急ぎいただけますと幸いです。"],
  [/(これ|それ)やっ(とい|ておい)て(ください|ね|よ)?[。！!]*/g, "こちらのご対応をお願いできますでしょうか。"],
  [/やっ(とい|ておい)て(ください|ね|よ)?[。！!]*/g, "ご対応をお願いできますでしょうか。"],
  [/してよ/g, "していただけますでしょうか"],
  [/だよ(ね)?/g, "です"],
  [/じゃん/g, "ではないでしょうか"],
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
  [/。{2,}/g, "。"],
];

// やわらか:敬語にしすぎず、責める感じだけ消す。
const SOFT: Replacement[] = [
  [/おせ[ーぇえ]+(よ|な)?[。！!]*|遅すぎ(る|ん)[^。]*[。！!]*/g, "急がせてしまって申し訳ないのですが、早めだと助かります。"],
  [/(ふざけ(ん|る)な|いい加減にして(ください|よ)?)[。！!]*/g, "一度状況を教えてもらえると助かります。"],
  [/何回(言えば|言った)[^。？?]*[。？?]?/g, "念のため、もう一度お伝えしますね。"],
  [/[^。]*(使えな(い|ねー)|ありえ(ない|ねー)|あり得ない|うざ(い|っ)?|バカ|ばか|アホ|クソ|くそ)[^。]*[。！!]*/g, ""],
  [/ちゃんとして[^。]*[。！!]*/g, "確認してもらえると嬉しいです。"],
  [/は[？?]/g, ""],
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
  [/まだ(なの|ですか)?[？?！!。]+/g, "その後どんな感じでしょうか？"],
  [/(早く|はやく)して(よ|ね)?[。！!]*/g, "もし可能でしたら、早めに対応してもらえると助かります。"],
  [/急いで(ください|ね|よ)?[。！!]*/g, "急ぎで申し訳ないのですが、お願いできますか。"],
  [/やっ(とい|ておい)て(ください|ね|よ)?[。！!]*/g, "お願いしてもいいですか？"],
  [/(マジ|まじ)で?/g, "本当に"],
  [/すげ[ーぇえ]+(な|ね|よ)?/g, "すごいですね"],
  [/終わった(の|ん)[？?]?/g, "終わったんですね！"],
  [/じゃん/g, "ですね"],
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
  const converted = apply(body, BUSINESS).trim();
  // 暴言だけの文章は削ると何も残らないので、要点を確認する文に差し替える
  const business = converted || "いただいた件について、いくつか確認させていただきたい点がございます。";
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
      text: `お疲れさまです。お忙しいところすみません。\n${apply(body, SOFT).trim() || "いただいた件で、少し確認させてほしいことがあります。"}\nご無理のない範囲で大丈夫ですので、よろしくお願いします。`,
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

  const rudeHits: { phrase: string; reason: string; suggestion: string; base: number }[] = [];
  for (const r of RUDE) {
    const m = req.message.match(r.pattern);
    // 「おせーよ」と「せーよ」のように、検出済みの箇所の一部なら二重に数えない
    if (m && !rudeHits.some((h) => h.phrase.includes(m[0]) || m[0].includes(h.phrase))) {
      rudeHits.push({ phrase: m[0], reason: r.reason, suggestion: r.suggestion, base: r.base });
    }
  }
  points += rudeHits.reduce((sum, r) => sum + r.base + (r.base >= 2 ? RUDE_WEIGHT[req.recipient] : 0), 0);
  const allHits = [...hits.map(({ phrase, reason, suggestion }) => ({ phrase, reason, suggestion })), ...rudeHits];

  const casual = CASUAL.test(req.message);
  if (casual && FORMAL_RECIPIENTS.includes(req.recipient)) points += 2;
  if (req.channel === "メール" && casual) points += 1;

  const score = Math.min(5, Math.max(1, 1 + Math.ceil(points / 2)));
  const pool = REACTIONS[score];

  return {
    score,
    label: `（デモ）${LABELS[score]}`,
    summary:
      allHits.length === 0 && !casual
        ? `${req.recipient}宛てとして目立った危険表現は見つかりませんでした。(デモモード:登録済みのルールだけで判定しているため、ルールに無い言い回しは見逃すことがあります)`
        : `${req.recipient}宛てだと、${allHits.map((h) => `「${h.phrase}」`).join("")}${casual ? "くだけた表現" : ""}が引っかかります。(デモモード:ルールで簡易判定しています)`,
    reactions: pickPersonas(req.recipient).map((persona, i) => ({
      persona,
      reaction: pool[i % pool.length].reaction,
      inner_voice: pool[i % pool.length].inner,
      ignore_rate: Math.min(100, score * 15 + Math.floor(Math.random() * 20)),
    })),
    risky_phrases: allHits.map(({ phrase, reason, suggestion }) => ({ phrase, reason, suggestion })),
    rewrites: rewrites(req.message, req.recipient),
  };
}
