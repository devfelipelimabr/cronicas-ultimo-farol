# Crônicas do Último Farol

Tower defense 3D low-poly (Three.js r128) com economia persistente, contas de jogador, placar validado anti-cheat e PWA.

## Rodar
```
node server.js   # http://localhost:3000
```

## Estrutura
- `public/index.html` / `three.html` — jogo 3D oficial (mesmo arquivo)
- `public/three-assets/three.min.js` — Three.js r128 (UMD)
- `public/sprites/` — pixel-art dos heróis (PNG com transparência)
- `server.js` — backend zero-dep: contas (scrypt), OAuth Google/GitHub, tokens HMAC de run, validação anti-cheat (abates/ouro/fragmentos/duração), leaderboard, PvP (rotas SSE prontas)
- `oauth.json` — preencher com client_id/secret para ativar OAuth
- Deploy: Sprite Fly.io (porta 8080; Dockerfile/fly.toml históricos na raiz do Git)

## Estado
Versão 3D oficial. Versões legadas (Phaser 2D, Canvas clássica) no histórico do Git.
