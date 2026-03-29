# Tipping Competition

A web-based AFL tipping competition app built with Next.js and Supabase.

## Local Setup Steps
1. **Create Supabase Project**: Go to [supabase.com](https://supabase.com) and create a new project.
2. **Run Migrations**: Apply the SQL files in `supabase/migrations/` in order to set up your database schema.
3. **Set Environment Variables**: Copy `.env.local.example` to `.env.local` and fill in your Supabase project URL and anon key.
4. **Important**: Never store passwords or secrets in your repository.

## Features
- Supabase Auth as the identity provider (no passwords stored in app DB)
- Row Level Security (RLS) policies so users only see their own data
- Shared AFL fixture (teams, rounds, games) used across all competitions
- Admin role via `profiles.is_admin` flag
- Supports tips with optional margin and score predictions
- Money/payment tracking via transactions + bank details

## Tech Stack
- **Frontend**: Next.js (App Router)
- **Database & Auth**: Supabase (Postgres + Auth)
- **Hosting**: Vercel
