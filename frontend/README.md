# Frontend (Next.js)

This frontend is connected to the FastAPI backend and includes:
- cinematic landing with zoom narrative and 3D hero object,
- system transparency modules with animated architecture flow,
- digital twin graph preview and control bypass storyline,
- control-room dashboard with real backend data and investigation panel.

Backend integration includes:
- auth login,
- dataset load,
- rule run,
- pathway detection,
- graph fetch,
- system-state and metrics fetch,
- investigation panel generation.

## Required env

Create `frontend/.env.local` from `frontend/.env.example`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_DEMO_USERNAME=admin
NEXT_PUBLIC_DEMO_PASSWORD=Admin@12345
```

## Run

1. Install frontend deps:
   - `cd frontend`
   - `npm install`
2. Start frontend:
   - `npm run dev`
3. Open:
   - `http://localhost:3000`
   - click `Explore Platform`
   - dashboard auto-initializes against backend APIs.
   - use theme toggle for animated light/dark transitions.

## Notes

- `NEXT_PUBLIC_DEMO_USERNAME` and `NEXT_PUBLIC_DEMO_PASSWORD` must match backend `BOOTSTRAP_USERS_JSON` or provisioned users.
- Backend CORS must allow your frontend origin (default includes `http://localhost:3000`).
