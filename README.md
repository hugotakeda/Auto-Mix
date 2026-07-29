# Auto Mix

Auto Mix is a Discord bot designed to completely automate Counter-Strike 2 (CS2) 5v5 matches ("mixes") within your server. 

With zero configuration required for end-users, it seamlessly handles drafting, map selection, voice channel management, stat tracking, and competitive rankings.

## 🌟 Features

- 🎮 **Matchmaking Modes:** Choose between a Captain Draft (alternating player picks) or a Random Team generator.
- 🗺️ **Pick & Ban System:** Built-in interactive map pick & ban for both BO1 (Best of 1) and BO3 (Best of 3) formats using the active duty map pool.
- 🔊 **Auto Voice Channels:** Automatically creates temporary voice channels (e.g., `MIX - NAVI` vs `MIX - FURIA`), moves all 10 players into their respective team channels, and **restricts voice permissions so spectators are muted**. Cleans up automatically after the match.
- 📊 **Stat Tracking & K/D:** Players can register their match stats (kills/deaths) to calculate their accumulated server-wide K/D ratio over time.
- 🖼️ **Dynamic Profile Cards:** Generates a visually stunning, custom Canvas-based profile image showing the user's avatar, position, matches played, total K/D, Gamersclub level, and Faceit level. 
- 🏆 **Automated Top 10 Ranking:** Automatically tracks the best players and generates a highly polished Canvas-based leaderboard image every 15 days (mid-month and end of month), sending it to a configured channel.
- ⚙️ **Quick Setup:** Interactive setup panel for players to easily claim their in-game roles (IGL, Entry Fragger, AWPer, etc.) and competitive levels.

## 🎨 Visual Identity ("Auto")

The bot features a custom visual identity dubbed **"Auto"**, designed to look premium, modern, and esports-ready:
- **Palette:** Graphite dark theme (`#1C1C1E`) with high-contrast Mint accent (`#3ECF8E`).
- **Typography:** Uses **Sora** (for display/headers) and **JetBrains Mono** (for technical data and labels).
- **Automated Graphics:** Profile and Ranking cards are generated programmatically using `@napi-rs/canvas`.

## 💻 Requirements

- Node.js v20+ (recommended)
- TypeScript
- `@napi-rs/canvas` (Requires specific system dependencies on some Linux distros. Note: `APT=canvas` is required on Discloud)
- `better-sqlite3` (Reliable SQLite implementation)

## 🚀 Installation

1. Clone the repository and install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory and add your Discord bot credentials:
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
```

3. Deploy the slash commands to your Discord application:
```bash
npm run deploy
```

4. Start the bot:
```bash
npm start
```
*(Alternatively, use `npm run dev` for development with auto-reload via tsx).*

## 📌 Usage / Commands

- `/setup` - (Admin only) Sends the initial configuration panel to a channel.
- `/mix` - Starts a 5v5 mix. Requires exactly 10 players in a voice channel.
- `/mix-fim` - Registers your kills and deaths after a match.
- `/perfil` - Displays your generated profile card.
- `/ranking` - Instantly generates and displays the Top 10 Ranking image.
- `/set-ranking-channel` - (Admin only) Sets the channel where the automated bi-weekly (quinzenal) ranking will be posted.
- `/reset-kd` - (Admin only) Resets a player's K/D stats.
- `/reset-partidas` - (Admin only) Resets a player's match count.

## 🏗️ Architecture

- Built with [Discord.js v14](https://discord.js.org/)
- Database handled locally via `better-sqlite3`
- Fully typed with TypeScript
- High-performance image generation powered by `@napi-rs/canvas`
- Automated jobs powered by `node-cron`

## 📦 Deployment (Discloud)

To package the bot for hosting:
```bash
node zip-bot.js
```
This script bundles the bot into a `.zip` file while preserving correct Linux permissions and explicitly ignoring `node_modules` and `data.db` to prevent data loss.

## 📜 License

Private use. Developed for the Auto Bot ecosystem.
