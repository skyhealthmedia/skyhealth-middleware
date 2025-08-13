
# SkyHealth Middleware

A minimal middleware for your ChatGPT Agent to pull GA4 + social KPIs and a starter prospects list.

## Quickstart
1) Unzip, then:
```
npm i
cp .env.example .env   # fill secrets
npm run dev
```
2) Visit http://localhost:8080/health

## Deploy
Push to GitHub and create a **Web Service** on Render with:
- Build: `npm install && npm run build`
- Start: `npm start`
- Add your env vars from `.env`
