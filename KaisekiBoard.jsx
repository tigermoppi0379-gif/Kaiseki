export const metadata = {
  title: "部屋出し懐石 仕込みボード",
  description: "旅館キッチン用の配膳タイミング管理ボード",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
