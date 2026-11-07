# Crônicas do Último Farol

Tower defense **pixel art 2D** (Three.js/WebGL, câmera ortográfica) com economia persistente,
contas de jogador (senha + OAuth), placar validado anti-cheat e PWA instalável.

## Rodar
```
node server.js   # http://localhost:3000
```

## Branch `pixel-art-2d`
A `main` guarda a versão 3D low-poly. Esta branch é a conversão pixel-art 2D:
- Câmera ortográfica com leve inclinação (estilo TD clássico)
- Tabuleiro em tilemap pixel (canvas 16×16 por célula, nearest)
- Inimigos como sprites pixel-art gerados de mapas de pixels
- Heróis: pixel-art do jogador (public/sprites)
- Mesma lógica de jogo, economia, backend e PWA da versão 3D

## Estrutura
- `public/index.html` / `three.html` — jogo (mesmo arquivo)
- `server.js` — backend zero-dep: contas scrypt, OAuth Google/GitHub, tokens HMAC, validação anti-cheat, leaderboard, rotas PvP
- `oauth.json` — preencher com client_id/secret para ativar OAuth
- Deploy: Sprite Fly.io (porta 8080)

## Pendente
Economia (Fragmentos/Fortaleza/Loja) na UI 2D, PvP no cliente, PWA bump de versão.
