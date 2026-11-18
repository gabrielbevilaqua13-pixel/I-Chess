# Mestre Interior

Treinador de xadrez que aprende com as suas próprias partidas.

**🔗 [Ver o site no ar](https://SEU-LINK.onrender.com)**
*(o plano gratuito hiberna: o primeiro acesso pode levar alguns segundos)*

![Tela do Mestre Interior](screenshot.png)

O app conecta na sua conta do [Lichess](https://lichess.org/) ou do [Chess.com](https://www.chess.com/), analisa cada lance com o Stockfish (WASM, roda no navegador) e mostra precisão, imprecisões, erros, capivaradas e as lições que se repetem nos seus jogos.

## Funcionalidades

- Importa partidas do Lichess e do Chess.com pelo nome de usuário
- Análise lance a lance com Stockfish 16, direto no navegador (sem servidor de análise)
- Classificação de cada jogada: melhor, boa, imprecisão, erro e capivarada
- Precisão da partida calculada no mesmo padrão do Lichess
- Detecção de padrões de erro que se repetem, com puzzles de treino

## Stack

- [React 19](https://react.dev/) + [TanStack Start](https://tanstack.com/start) (SSR) e TanStack Router
- [Tailwind CSS 4](https://tailwindcss.com/) com os componentes do shadcn/ui
- [chess.js](https://github.com/jhlywa/chess.js) + [react-chessboard](https://github.com/Clariity/react-chessboard)
- [Stockfish 16 NNUE](https://stockfishchess.org/) servido de `public/stockfish/`
- Build de produção com [Nitro](https://nitro.build/) (saída em `.output/`)
- Docker e [Render](https://render.com/) para o deploy

## Como funciona a análise

1. As partidas são buscadas na API pública do Lichess ou do Chess.com.
2. Cada lance é avaliado pelo Stockfish em um Web Worker.
3. A diferença de avaliação entre o lance jogado e o melhor lance classifica a jogada em melhor/boa/imprecisão/erro/capivarada.
4. A precisão da partida é calculada no mesmo padrão usado pelo Lichess, e os padrões de erro alimentam as lições da página de puzzles.

## Rodando localmente

Requisitos: [Bun](https://bun.sh/) 1.1+ (o projeto usa `bun.lock`; `npm install` também funciona) e Node.js 22+.

```bash
bun install
bun run dev
```

O servidor de desenvolvimento sobe em http://localhost:3000.

### Build e execução

```bash
bun run build   # gera .output/server/index.mjs e os assets do cliente
bun run start   # serve o build de produção
```

O preset padrão do Nitro é `node-server`. Variáveis de ambiente expostas ao cliente devem começar com `VITE_`.

## Scripts

| Script   | Descrição                                   |
| -------- | ------------------------------------------- |
| `dev`    | Servidor de desenvolvimento com HMR         |
| `build`  | Build de produção (cliente + servidor SSR)  |
| `start`  | Executa o build de produção                 |
| `lint`   | ESLint                                      |
| `format` | Prettier                                    |
| `test`   | Vitest                                      |

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

## Deploy

O build de produção é um servidor Node autocontido em `.output/`. O `Dockerfile` empacota esse build em uma imagem enxuta (Node 22 Alpine) e o `render.yaml` publica essa imagem no [Render](https://render.com/).

### Docker

```bash
docker build -t mestre-interior .
docker run --rm -p 3000:3000 mestre-interior
```

O servidor escuta em `0.0.0.0` na porta definida por `PORT` (padrão 3000).

### Render

1. Faça o push do repositório no GitHub.
2. No [dashboard do Render](https://dashboard.render.com/), escolha **New → Blueprint** e selecione o repositório. O Render lê o `render.yaml` e cria o web service a partir do Dockerfile.
3. Aguarde o primeiro build. O health check usa `GET /`.

O blueprint usa o plano gratuito, que hiberna a instância após alguns minutos sem tráfego.

O mesmo Dockerfile funciona em qualquer plataforma que rode containers (Fly.io, Railway, Cloud Run, VPS).

## Autor

**Gabriel de Paula Beviláqua** · Engenharia Civil (UVA) · Tianguá, CE

## Licença

[MIT](LICENSE)
