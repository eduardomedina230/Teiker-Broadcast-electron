# Teiker Broadcast — Cliente Electron

Cliente de escritorio (pastilla / mini / panel) para recibir avisos del equipo.

## Desarrollo

```bash
npm install
npm start
```

Copia `.env.example` a `.env` (o usa el `.env` local) con `BACKEND_URL` y `REGISTER_SECRET`.

## Publicar versión nueva (Windows)

### Automático (recomendado)

1. Sube la versión en `package.json` (ej. `1.0.2`).
2. En GitHub → **Settings → Secrets → Actions**, configura:
   - `BACKEND_URL` — URL del panel (ej. `https://teiker-broadcast-web.vercel.app`)
   - `REGISTER_SECRET` — mismo valor que en el panel
3. Crea y sube un tag:

```bash
git tag v1.0.2
git push origin main --tags
```

El workflow `.github/workflows/release-win.yml` compila en Windows y publica el Release.

### Manual desde Mac

```bash
export GH_TOKEN=tu_token_github_con_permiso_repo
npm run build:win:publish
```

## Auto-actualización

Las apps empaquetadas revisan [GitHub Releases](https://github.com/eduardomedina230/Teiker-Broadcast-electron/releases) al iniciar y cada 6 horas. La primera instalación en cada PC sigue siendo manual con el `.exe` del Release.
