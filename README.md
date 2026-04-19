# Bettermax Enterprise — HR Management System

## Quick Start (Local)

### 1. Configure environment variables
Copy `.env.example` to `.env` and fill in your values:
```
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-long-random-secret-64-chars-minimum
NODE_ENV=development
```
Get your keys from: **Supabase Dashboard → Project Settings → API**

### 2. Install dependencies
```bash
npm install
```

### 3. Run the server
```bash
npm run dev
```
Open http://localhost:3000

---

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Set these in Vercel dashboard → Settings → Environment Variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET` — long random string (64+ chars)
- `NODE_ENV` = `production`

---

## OT Calculation Rules

| Hours Worked | Days Counted | Example (RM 80/day) |
|---|---|---|
| 4h | 0.50 days | RM 40.00 |
| 8h | 1.00 days | RM 80.00 |
| 10h | 1.25 days | RM 100.00 |
| 12h | 1.50 days | RM 120.00 |

- Standard day: 08:00–17:00 (8 hours after lunch deduction)
- Lunch 12:00–13:00 is auto-deducted if clock-in/out spans that window
- OT formula: `days = 1.0 + (hours - 8) / 8`

## Database Tables

| Table | Purpose |
|---|---|
| `employees` | Worker profiles, daily rate, permit info |
| `hr_attendance` | Daily clock-in/out, hours & days worked |
| `salary_records` | Finalized monthly salary summaries |
| `advances` | Salary advance deductions |
| `users` | Admin login accounts |
| `projects` | Project sites with GPS/navigation links |

> Note: Table is named `hr_attendance` (not `attendance`) to avoid conflict with an existing table in this Supabase project.
