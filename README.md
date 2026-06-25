# 部屋出し懐石 仕込みボード

旅館のキッチンで使う、配膳タイミング管理ボードです。

## 中身

- `app/page.js` … トップページ（ボード本体を表示するだけ）
- `app/layout.js` … 全体のレイアウト・タイトル設定
- `components/KaisekiBoard.jsx` … アプリ本体（事前設定・ボード・遅延管理の3画面）
- `components/icons.jsx` … 画面内で使うアイコン（外部パッケージなしの自作SVG）

## データの保存について

このプロジェクトでは、ブラウザの **localStorage** にデータを保存します。
つまり「保存したタブレット・ブラウザだけ」にデータが残ります。

複数のタブレットでチーム共有したい場合は、後ほどデータベース（例:
Supabase, Firebase など）に差し替える必要があります。まずは1台で動かして
動作を確認するのにおすすめです。

## ローカルで動かす（パソコンで動作確認したいとき）

1. [Node.js](https://nodejs.org)をインストール（18以上推奨）
2. ターミナルでこのフォルダに移動
3. 以下を実行

```bash
npm install
npm run dev
```

4. ブラウザで `http://localhost:3000` を開く

## GitHubに上げる

1. [github.com](https://github.com)でアカウント作成
2. 新しいリポジトリを作成（例: `kaiseki-board`）
3. このフォルダの中身を全部アップロード
   - GitHub Desktop を使うか、コマンドラインで以下を実行

```bash
cd kaiseki-board
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/【あなたのユーザー名】/kaiseki-board.git
git push -u origin main
```

## Vercelでデプロイ（タブレットで使えるURLを発行）

1. [vercel.com](https://vercel.com)でアカウント作成（GitHubでログイン推奨）
2. 「Add New」→「Project」
3. さっき作ったGitHubリポジトリを選択
4. 設定はそのままで「Deploy」をクリック
5. 数分待つと `https://kaiseki-board-xxxx.vercel.app` のようなURLが発行されます

このURLをタブレットのブラウザで開けば使えます。ホーム画面に追加すると
アプリのように起動できます（Safariなら共有ボタン →「ホーム画面に追加」）。

## 今後アプリを手直しするとき

1. ここ（Claude）でコードを修正してもらう
2. 修正された `components/KaisekiBoard.jsx` の中身をコピー
3. GitHub上で同じファイルを開いて貼り替え、コミット
4. Vercelが自動で再デプロイ（数分待てば反映されます）
