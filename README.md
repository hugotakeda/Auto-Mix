# Auto Mix

Auto Mix is a Discord bot designed to completely automate Counter-Strike 2 (CS2) 5v5 matches ("mixes") within your server. 

With zero configuration required for end-users, it seamlessly handles drafting, map selection, voice channel management, and stat tracking.

## Features

- 🎮 **Matchmaking Modes:** Choose between a Captain Draft (alternating player picks) or a Random Team generator.
- 🗺️ **Pick & Ban System:** Built-in interactive map pick & ban for both BO1 (Best of 1) and BO3 (Best of 3) formats using the active duty map pool.
- 🔊 **Auto Voice Channels:** Automatically creates temporary voice channels (e.g., `MIX - NAVI` vs `MIX - FURIA`) and moves all 10 players into their respective team channels. Cleans up automatically after the match.
- 📊 **Stat Tracking & K/D:** Players can register their match stats (kills/deaths) to calculate their accumulated server-wide K/D ratio over time.
- 🖼️ **Dynamic Profile Cards:** Generates a visually stunning, custom Canvas-based profile image showing the user's avatar, position, matches played, total K/D, Gamersclub level, and Faceit level.
- ⚙️ **Quick Setup:** Interactive setup panel for players to easily claim their in-game roles (IGL, Entry Fragger, AWPer, etc.) and competitive levels.

## Requirements

- Node.js v16+ (v20+ recommended)
- TypeScript
- `@napi-rs/canvas` (Requires specific system dependencies on some Linux distros, `APT=canvas` is required on Discloud)
- `sql.js` (Pure JavaScript SQLite implementation)

## Installation

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

## Usage

- `/setup` - (Admin only) Sends the initial configuration panel to a channel.
- `/mix` - Starts a 5v5 mix. Requires exactly 10 players in a voice channel.
- `/mix-fim` - Registers your kills and deaths after a match.
- `/perfil` - Displays your generated profile card.

## Architecture

- Built with [Discord.js v14](https://discord.js.org/)
- Database handled locally via `sql.js` (no native C++ build tools required on Windows)
- Fully typed with TypeScript
- Image generation powered by `@napi-rs/canvas`

## License

Private use. Developed for the Auto Bot ecosystem.
