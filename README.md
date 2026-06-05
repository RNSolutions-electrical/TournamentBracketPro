# 🪣 WasherBox Brotherhood — Season 6 App
### International Statewide World Championships

Live scoring, bracket management, and championship certificates — deployable to Netlify with real-time sync via Supabase.

---

## 🚀 Setup in 5 Steps

### 1. Create a Supabase Project
- Go to [supabase.com](https://supabase.com) and create a free account
- Create a new project (name it `washerbox-s6` or whatever you like)
- Wait for it to spin up (~1 min)

### 2. Run the Database Migration
- In your Supabase dashboard, go to **SQL Editor**
- Open the file `supabase_migration.sql` from this folder
- Paste it in and click **Run**
- This creates all tables and enables Realtime

### 3. Get Your Keys
- In Supabase, go to **Settings → API**
- Copy your **Project URL** and **anon/public** key

### 4. Configure Environment Variables
Create a `.env` file in this folder (copy from `.env.example`):
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 5. Deploy to Netlify
- Push this folder to a GitHub repo (or drag-drop it to Netlify)
- In Netlify: **New site → Import from Git** (or drag the folder)
- Under **Site settings → Environment variables**, add:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Deploy. Done. Share the URL with the Brotherhood.

---

## 🏆 How It Works

| Feature | Details |
|---|---|
| **Live sync** | Scores update live across all devices via Supabase Realtime |
| **Commissioner PIN** | `1977` — only the commissioner can enter scores, declare winners, or reset |
| **Scoring** | Box = 1pt, Cup = 3pts · Cancellation scoring — net only recorded after confirmation |
| **Bracket modes** | Random / Manual seed / Combo |
| **Export** | Full bracket PDF + 1st–4th place certificates |

## 📱 Running Locally
```bash
npm install
npm run dev
```

---

*To each their own, with love and happiness.*
