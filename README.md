# Auto Mix

O **Auto Mix** é um bot para Discord criado para automatizar completamente as partidas 5v5 ("mixes") de Counter-Strike 2 (CS2) dentro do seu servidor.

Com zero necessidade de configuração para os jogadores, o bot gerencia a divisão dos times, escolha de mapas, gerenciamento de canais de voz, rastreamento de estatísticas e a geração de rankings competitivos.

## 🌟 Funcionalidades

- 🎮 **Modos de Matchmaking:** Escolha entre o formato "Capitães" (onde dois jogadores escolhem seus times alternadamente) ou o modo "Aleatório".
- 🗺️ **Sistema de Pick & Ban:** Veto interativo de mapas (com a pool atual do CS2) embutido no Discord, suportando MD1 (Melhor de 1) e MD3 (Melhor de 3).
- 🔊 **Canais de Voz Automáticos:** O bot cria canais de voz temporários (ex: `MIX - NAVI` vs `MIX - FURIA`), move os 10 jogadores automaticamente para seus respectivos times e **restringe as permissões de fala para que espectadores fiquem mutados**. Os canais são apagados sozinhos no final.
- 📊 **Estatísticas e K/D:** Os jogadores registram seus abates e mortes no final da partida, e o bot calcula o K/D acumulado dentro do servidor.
- ⚙️ **Configuração Rápida:** Painel interativo para os jogadores selecionarem suas funções em jogo (IGL, Entry, AWP, etc.) e níveis de GC/Faceit.

## 🖼️ Imagens Dinâmicas (Cards & Ranking)

O bot conta com a identidade visual **"Auto"** — um design premium, minimalista e voltado para os esports, utilizando tons de grafite, um verde menta de destaque e as fontes **Sora** e **JetBrains Mono**.

Todas as imagens são geradas dinamicamente e em alta resolução pelo bot usando o Canvas.

### 👤 Cartão de Perfil (`/perfil`)
Gera um cartão visual mostrando o avatar do usuário, sua função no jogo, K/D, total de abates, níveis e histórico de vitórias/derrotas.
![Preview do Perfil](./profile_preview.png)

### 🏆 Ranking Automático
A cada 15 dias (no meio e no fim do mês), o bot rastreia os 10 melhores jogadores do servidor (com base em Kills e KD) e gera o leaderboard atualizado.
![Preview do Ranking](./ranking_preview.png)

## 💻 Requisitos

- Node.js v20+ (recomendado)
- TypeScript
- `@napi-rs/canvas` (Atenção: algumas hospedagens Linux exigem dependências no sistema. No Discloud, adicione `APT=canvas` no config)
- `better-sqlite3` (Banco de dados local rápido e confiável)

## 🚀 Instalação

1. Clone o repositório e instale as dependências:
```bash
npm install
```

2. Crie um arquivo `.env` na raiz do projeto e adicione suas credenciais do bot do Discord:
```env
DISCORD_TOKEN=seu_token_aqui
CLIENT_ID=seu_client_id_aqui
```

3. Registre os "Slash Commands" no Discord:
```bash
npm run deploy
```

4. Inicie o bot:
```bash
npm start
```
*(Para desenvolvimento local com recarregamento automático, utilize `npm run dev`).*

## 📌 Comandos

- `/setup` - (Apenas Admins) Envia o painel de configuração inicial para os jogadores pegarem seus cargos.
- `/mix` - Inicia um mix 5v5. Exige que exatamente 10 jogadores estejam no mesmo canal de voz.
- `/mix-fim` - Registra os abates e mortes após a partida.
- `/perfil` - Gera e exibe o seu cartão de perfil personalizado.
- `/ranking` - Gera instantaneamente a imagem do Top 10 atual do servidor.
- `/set-ranking-channel` - (Apenas Admins) Define o canal oficial onde o ranking quinzenal será postado automaticamente.
- `/reset-kd` - (Apenas Admins) Zera os status de K/D de um jogador específico.
- `/reset-partidas` - (Apenas Admins) Zera o número de partidas jogadas.

## 🏗️ Arquitetura

- Desenvolvido sobre [Discord.js v14](https://discord.js.org/)
- Banco de dados leve rodando em `better-sqlite3`
- Fortemente tipado com TypeScript
- Geração de imagens otimizada com `@napi-rs/canvas`
- Rotinas e eventos automáticos controlados por `node-cron`

## 📦 Hospedagem (Discloud)

Para empacotar o bot antes de fazer o upload para o Discloud:
```bash
node zip-bot.js
```
Este script cria o `.zip` ignorando com segurança o banco de dados (`data.db`) e a pasta `node_modules`, além de aplicar as permissões corretas para rodar em servidores Linux.

## 📜 Licença

Uso Privado. Desenvolvido para o ecossistema Auto Bot.
