# Teiker Broadcast — Cliente Electron

Cliente de escritorio (pastilla / mini / panel) para recibir avisos del equipo.

## Desarrollo

```bash
npm install
npm start
```

Copia `.env.example` a `.env` con `BACKEND_URL` y `REGISTER_SECRET`.

## Publicar versión nueva (automático)

### Un solo comando

Después de commitear tus cambios de código:

```bash
npm run release:push
```

Eso hace:
1. Sube el patch en `package.json` (1.0.1 → 1.0.2)
2. Commitea y pushea a `main`
3. **GitHub Actions** compila en Windows y publica el Release

Bump **minor** (1.0.x → 1.1.0):

```bash
npm run release -- minor --push
```

Desde la raíz del monorepo:

```bash
npm run release:electron:push
```

### Sin push (revisar antes)

```bash
npm run release        # solo bump + commit local
npm run release:push   # cuando estés listo
```

### Botón manual en GitHub

**Actions → Release Windows → Run workflow** (usa la versión actual de `package.json` en `main`).

### Secrets requeridos (una vez)

En **Settings → Secrets → Actions** del repo:

| Secret | Valor |
|--------|--------|
| `BACKEND_URL` | `https://teiker-broadcast-web.vercel.app` |
| `REGISTER_SECRET` | mismo que en producción |

## Auto-actualización en cada PC

Las apps instaladas:
- Buscan updates al **abrir**, al **despertar el PC** y cada **1 hora**
- **Descargan** el `.exe` en segundo plano
- Muestran notificación — **clic = reinicia e instala** (o al cerrar la app)

La **primera instalación** en cada PC sigue siendo manual con el `.exe` del [Release](https://github.com/eduardomedina230/Teiker-Broadcast-electron/releases).

## Qué se actualiza solo vs qué no

| Cambio | ¿Llega solo a todos? |
|--------|----------------------|
| `web/` (API, panel admin) | **Sí** — push a Vercel |
| `electron/src/` (pastilla, UI) | **Sí** — tras `npm run release:push` y que cada PC actualice |
| Solo código sin `release:push` | **No** — falta nueva versión en Releases |
