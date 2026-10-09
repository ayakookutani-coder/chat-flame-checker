import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "送信前の炎上チェッカー",
  description: "送る前のメールやSlackが相手にどう受け取られるかを生成AIで予測するアプリ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
