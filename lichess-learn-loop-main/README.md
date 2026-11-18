# Mestre Interior

Treinador de xadrez que aprende com as suas próprias partidas. O app conecta na sua conta do
[Lichess](https://lichess.org) ou do [Chess.com](https://www.chess.com), analisa cada lance com o
Stockfish (WASM, roda no navegador) e mostra precisão, imprecisões, erros, capivaradas e as lições
que se repetem nos seus jogos.

## Stack

- [React 19](https://react.dev) + [TanStack Start](https://tanstack.com/start) (SSR) e TanStack Router
- [Tailwind CSS 4](https://tailwindcss.com) com os componentes do shadcn/ui
- [chess.js](https://github.com/jhlywa/chess.js) + [react-chessboard](https://github.com/Clariity/react-chessboard)
- [Stockfish 16 NNUE](https://stockfishchess.org) servido de `public/stockfish/`
- Build de produção com [Nitro](https://nitro.build) (saída em `.output/`)

## Rodando localmente

Requisitos: [Bun](https://bun.sh) 1.1+ (o projeto usa `bun.lock`; `npm install` também funciona) e Node.js 22+.

```sh
bun install
bun run dev
```

O servidor de desenvolvimento sobe em `http://localhost:3000`.

## Build e execução

```sh
bun run build   # gera .output/server/index.mjs e os assets do cliente
bun run start   # serve o build de produção
```

O preset padrão do Nitro é `node-server`. Para publicar em outra plataforma, informe o preset na
build, por exemplo:

```sh
NITRO_PRESET=vercel bun run build
NITRO_PRESET=netlify bun run build
NITRO_PRESET=cloudflare-module bun run build
```

Variáveis de ambiente expostas ao cliente devem começar com `VITE_`.

## Deploy

O build de produção é um servidor Node autocontido em `.output/`. O `Dockerfile` empacota esse
build em uma imagem enxuta (Node 22 Alpine, sem dependências de build) e o `render.yaml` publica
essa imagem no [Render](https://render.com) com um clique.

### Docker

```sh
docker build -t mestre-interior .
docker run --rm -p 3000:3000 mestre-interior
```

O servidor escuta em `0.0.0.0` na porta definida por `PORT` (padrão `3000`):

```sh
docker run --rm -e PORT=8080 -p 8080:8080 mestre-interior
```

### Render

1. Faça o push do repositório no GitHub.
2. No [dashboard do Render](https://dashboard.render.com), escolha **New → Blueprint** e selecione o
   repositório. O Render lê o `render.yaml` e cria o web service a partir do `Dockerfile`.
3. Confirme o plano e aguarde o primeiro build. O health check usa `GET /`.
4. O Render injeta `PORT` automaticamente; não é preciso configurar variáveis de ambiente.

O blueprint usa o plano gratuito, que hiberna a instância após alguns minutos sem tráfego (o
primeiro acesso depois disso demora alguns segundos). Para evitar a hibernação, troque `plan: free`
por `plan: starter` no `render.yaml`.

### Outros hosts

O mesmo `Dockerfile` funciona em qualquer plataforma que rode containers (Fly.io, Railway, Cloud Run,
VPS). Como alternativa sem container, rode `bun run build` no host e inicie com
`node .output/server/index.mjs`. Para plataformas com runtime próprio, gere o build com o preset
correspondente (`NITRO_PRESET=vercel`, `netlify`, `cloudflare-module`).

## Scripts

| Script          | Descrição                                  |
| --------------- | ------------------------------------------ |
| `dev`           | Servidor de desenvolvimento com HMR        |
| `build`         | Build de produção (cliente + servidor SSR) |
| `start`         | Executa o build de produção                |
| `lint`          | ESLint                                     |
| `format`        | Prettier                                   |
| `test`          | Vitest                                     |

## Estrutura

```
src/
  routes/          # páginas (home, jogador, partida, puzzles)
  components/      # tabuleiro e componentes de UI
  lib/             # clientes Lichess/Chess.com, motor Stockfish e análise
  server.ts        # entrada SSR (tratamento de erros)
  start.ts         # middlewares de request (erros + CSRF)
public/stockfish/  # binários do Stockfish (WASM)
```

## Como funciona a análise

1. As partidas são buscadas na API pública do Lichess ou do Chess.com.
2. Cada lance é avaliado pelo Stockfish em um Web Worker.
3. A diferença de avaliação entre o lance jogado e o melhor lance classifica a jogada em
   melhor/boa/imprecisão/erro/capivarada.
4. A precisão da partida é calculada no mesmo padrão usado pelo Lichess, e os padrões de erro
   alimentam as lições da página de puzzles.
