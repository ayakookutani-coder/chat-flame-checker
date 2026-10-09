"use client";

import { useState } from "react";
import { CHANNELS, RECIPIENTS, TONES, type CheckResult, type Channel, type Recipient } from "@/lib/schema";

const EXAMPLES = [
  "先日の件、まだでしょうか。至急対応お願いします。",
  "資料拝見しました。正直、前回の打ち合わせの内容が反映されていないように見えます。",
  "明日休みます。引き継ぎは特にないです。",
  "お疲れ様です！本日の定例ですが、資料が間に合わなかったのでリスケでお願いできますでしょうか🙏",
];

const SCORE_COLORS = ["", "bg-emerald-500", "bg-lime-500", "bg-amber-500", "bg-orange-600", "bg-red-600"];

function Highlighted({ text, phrases }: { text: string; phrases: string[] }) {
  const targets = phrases.filter((p) => p && text.includes(p));
  if (targets.length === 0) return <>{text}</>;
  const escaped = targets.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "g"));
  return (
    <>
      {parts.map((part, i) =>
        targets.includes(part) ? (
          <mark key={i} className="rounded bg-red-100 px-0.5 text-red-800 underline decoration-red-400 decoration-wavy">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export default function Home() {
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState<Recipient>("顧客");
  const [channel, setChannel] = useState<Channel>("メール");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checkedText, setCheckedText] = useState("");
  const [mock, setMock] = useState(false);
  const [tone, setTone] = useState<(typeof TONES)[number]>("ビジネス標準");
  const [copied, setCopied] = useState(false);

  async function check() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, recipient, channel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "エラーが発生しました");
      setResult(data.result);
      setMock(data.mock);
      setCheckedText(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  const rewrite = result?.rewrites.find((r) => r.tone === tone);

  async function copy() {
    if (!rewrite) return;
    await navigator.clipboard.writeText(rewrite.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">🔥 送信前の炎上チェッカー</h1>
        <p className="mt-2 text-sm text-stone-600">
          送る前に、相手がどう受け取るかをAIが予測します。危ない言い回しの指摘と書き直し案つき。
        </p>
      </header>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <label className="mb-2 block text-sm font-semibold" htmlFor="message">
          送りたい文章
        </label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder="例:先日の件、まだでしょうか。至急対応お願いします。"
          className="w-full rounded-lg border border-stone-300 p-3 text-[15px] leading-relaxed outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="text-xs text-stone-500">例文:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setMessage(ex)}
              className="max-w-[16rem] truncate rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700 hover:bg-stone-200"
            >
              {ex}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">送り先</legend>
            <div className="flex flex-wrap gap-2">
              {RECIPIENTS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRecipient(r)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    recipient === r
                      ? "border-orange-600 bg-orange-600 text-white"
                      : "border-stone-300 bg-white text-stone-700 hover:border-orange-400"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">媒体</legend>
            <div className="flex gap-2">
              {CHANNELS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    channel === c
                      ? "border-stone-800 bg-stone-800 text-white"
                      : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <button
          type="button"
          onClick={check}
          disabled={loading || !message.trim()}
          className="mt-6 w-full rounded-xl bg-orange-600 py-3 text-base font-bold text-white shadow hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "🔥 燃え具合を測定中…" : result ? "🔄 もう一度チェック(反応する人が変わります)" : "🔥 炎上度をチェック"}
        </button>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </section>

      {result && (
        <div className="mt-8 space-y-6">
          {mock && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              デモモードで表示中です(APIキー未設定)。README の手順でキーを設定すると本物の診断になります。
            </p>
          )}

          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-stone-500">炎上度</p>
                <p className="mt-1 text-3xl" aria-label={`5段階中${result.score}`}>
                  {"🔥".repeat(result.score)}
                  <span className="opacity-20">{"🔥".repeat(5 - result.score)}</span>
                </p>
              </div>
              <span className={`rounded-full px-4 py-1.5 text-sm font-bold text-white ${SCORE_COLORS[result.score]}`}>
                {result.label}
              </span>
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-stone-700">{result.summary}</p>
            <div className="mt-4 rounded-lg bg-stone-50 p-3 text-[15px] leading-relaxed whitespace-pre-wrap">
              <Highlighted text={checkedText} phrases={result.risky_phrases.map((p) => p.phrase)} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">👥 受け取った人の反応予測</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {result.reactions.map((r) => (
                <div key={r.persona} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold text-orange-700">{r.persona}</p>
                  <p className="mt-2 rounded-lg bg-stone-100 p-2 text-sm">「{r.reaction}」</p>
                  <p className="mt-2 text-sm text-stone-600">💭 {r.inner_voice}</p>
                  <div className="mt-auto pt-3">
                    <div className="flex justify-between text-xs text-stone-500">
                      <span>既読スルー確率</span>
                      <span className="font-bold">{r.ignore_rate}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-stone-200">
                      <div className="h-1.5 rounded-full bg-orange-500" style={{ width: `${r.ignore_rate}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">⚠ 危険ワード</h2>
            {result.risky_phrases.length === 0 ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                危ない言い回しは見つかりませんでした。平和です。
              </p>
            ) : (
              <ul className="space-y-2">
                {result.risky_phrases.map((p) => (
                  <li key={p.phrase} className="rounded-2xl border border-stone-200 bg-white p-4 text-sm shadow-sm">
                    <p>
                      <span className="font-bold text-red-700">「{p.phrase}」</span>
                      <span className="text-stone-600"> — {p.reason}</span>
                    </p>
                    <p className="mt-1 text-stone-800">→ {p.suggestion}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-bold">✍ 書き直し案</h2>
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    tone === t
                      ? "border-orange-600 bg-orange-600 text-white"
                      : "border-stone-300 text-stone-700 hover:border-orange-400"
                  }`}
                >
                  {t === "土下座" ? "🙇 土下座" : t}
                </button>
              ))}
            </div>
            <p className="mt-4 min-h-24 rounded-lg bg-stone-50 p-3 text-[15px] leading-relaxed whitespace-pre-wrap">
              {rewrite?.text ?? "このトーンの案はありません"}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={copy}
                disabled={!rewrite}
                className="rounded-lg bg-stone-800 px-4 py-2 text-sm text-white hover:bg-stone-900 disabled:opacity-50"
              >
                {copied ? "コピーしました" : "コピー"}
              </button>
              <button
                type="button"
                onClick={() => rewrite && setMessage(rewrite.text)}
                disabled={!rewrite}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100 disabled:opacity-50"
              >
                この案で再チェック
              </button>
            </div>
          </section>
        </div>
      )}

      <footer className="mt-12 text-center text-xs text-stone-400">
        診断はAIによる予測です。最終判断はご自身で。
      </footer>
    </main>
  );
}
