# 🤖 Minecraft Discord Bot

A feature-rich Discord bot for Minecraft servers with economy, quests, and gambling systems!

## ✨ Features

### 💰 Economy System
- Persistent user balances stored in SQLite database
- Money synced with Minecraft (requires mod integration)
- Track total earned and spent coins

### 📋 Daily Quest System
- 40 unique quests that reset daily
- 5 random quests assigned per day
- Automatic progress tracking
- Quest types include:
  - Chatting milestones
  - Social interactions
  - Minecraft-related keywords
  - Time-based challenges
  - And much more!

### 🎰 Gambling Commands
- **Coinflip** - Double or nothing! Choose heads or tails
- **Slot Machine** - Multiple payout tiers:
  - 1/100 chance for x100 multiplier (JACKPOT!)
  - 1/10 chance for x5 multiplier
  - 3/10 chance for x2 multiplier

### ⚙️ Admin Commands
- Setup Minecraft server IP and port
- Configure console output channel
- Give coins to users

## 🎮 Commands

**Prefix:** `a ` (e.g., `a help`)

### Admin Commands (Requires Administrator permission)
- `a setup <ip> <port>` - Configure Minecraft server
- `a setupchannel [#channel]` - Set console channel
- `a give @user <amount>` - Give coins to user

### Economy Commands
- `a balance [@user]` - Check balance
- `a profile [@user]` - View detailed stats
- `a leaderboard` - Top 10 richest players

### Quest Commands
- `a quests` - View your daily quests
- `a daily` - Same as quests

### Gambling Commands
- `a cf <amount> <heads/tails>` - Coinflip gambling
- `a gamble <amount>` - Slot machine

### Info Commands
- `a help` - Show all commands
- `a ping` - Check bot latency
- `a serverinfo` - View server configuration

## 🚀 Setup

1. Add your Discord Bot Token to the secrets
2. Invite the bot to your server with proper permissions
3. Use `a setup` to configure your Minecraft server
4. Start earning coins through quests and gambling!

## 📊 Database

The bot uses SQLite to store:
- User balances and statistics
- Quest progress
- Server settings
- Daily quest assignments

## 🎨 All Commands Include Emojis!

Every command response includes colorful emojis to make the bot more engaging and fun to use!

## 🔮 Future Integration

This bot is designed to sync with a Minecraft mod for:
- In-game currency matching Discord currency
- Console output to Discord channel
- Real-time server status

---

Built for Minecraft server communities! 🎮⛏️
