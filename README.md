# 🔥 送信前の炎上チェッカー

送る前のメールや Slack の文章を貼ると、**相手にどう受け取られるかを生成AI(Claude)が予測する** Next.js アプリです。

## できること

- **炎上度の判定**:5段階の🔥と一言キャッチコピー(例:「静かに燃えるタイプ」)
- **受け取った人の反応予測**:送り先(顧客/上司/後輩/他部署/社外パートナー)に合わせて、ランダムに選ばれた3人のキャラクターが返信・心の声・既読スルー確率を予測。再チェックするたびに違う人が反応します
- **危険ワードの指摘**:原文の該当箇所をハイライトし、理由と言い換え案を表示
- **書き直し案**:やわらか / ビジネス標準 / 簡潔 / 🙇土下座 の4トーン。コピーや「この案で再チェック」も可能

## 仕組み

```
ブラウザ(src/app/page.tsx)
  └─ POST /api/check  { message, recipient, channel }
       └─ Route Handler(src/app/api/check/route.ts)
            └─ Anthropic Messages API(structured outputs で JSON を強制)
                 → 炎上度・反応・危険ワード・書き直し案を JSON で返す
```

- 返却 JSON の形は `src/lib/schema.ts` の zod スキーマで定義し、`client.messages.parse()` + `zodOutputFormat()` で型安全に受け取ります
- プロンプトと反応キャラクターの候補は `src/lib/prompt.ts`
- API キーが未設定のときは `src/lib/mock.ts` のダミー結果を返す**デモモード**で動きます

## 動かし方

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY を記入
npm run dev
```

http://localhost:3000 を開きます。

## 技術スタック

- Next.js 16(App Router)/ TypeScript / Tailwind CSS
- `@anthropic-ai/sdk`(モデル:`claude-opus-5-5`、`ANTHROPIC_MODEL` で変更可)
- zod(入力バリデーションと出力スキーマ)

## 開発メモ

Claude Code に指示を出しながら作成しました。
