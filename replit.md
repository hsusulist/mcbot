# Minecraft Discord Bot

## Overview
A comprehensive Discord bot for Minecraft servers featuring an economy system, daily quests, gambling mechanics, and admin tools. Built with Python using discord.py.

## Project Structure
- `bot.py` - Main bot file with all commands and event handlers
- `database.py` - SQLite database manager for users, quests, and settings
- `quests.py` - Quest pool with 40 unique daily quests
- `minecraft_bot.db` - SQLite database (auto-created on first run)

## Key Features
1. **Economy System** - Persistent user balances with earning/spending tracking
2. **Daily Quest System** - 5 random quests from pool of 40, resets daily
3. **Gambling** - Coinflip and slot machine with various multipliers
4. **Welcome System** - Automated welcome messages with member count for new members
5. **Admin Tools** - Server setup and coin management
6. **All commands use emojis** for better visual experience

## Bot Configuration
- **Prefix**: `a ` (e.g., `a help`, `a balance`)
- **Required Permissions**: Read Messages, Send Messages, Embed Links, Read Message History
- **Admin Commands**: Require Discord Administrator permission

## Command Categories
### Admin Commands
- Setup Minecraft server IP/port
- Configure console channel
- Setup welcome channel for new members
- Give coins to users

### Economy Commands  
- Check balance and profiles
- View leaderboard
- Track earnings and spending

### Quest System
- 40 unique quests (chat, social, Minecraft-themed, time-based)
- Automatic progress tracking via message monitoring
- Daily reset with random 5 quest selection
- Rewards ranging from 50-500 coins

### Gambling
- **Coinflip**: 50/50 chance, 2x multiplier
- **Slot Machine**: 
  - 1% chance for 100x (JACKPOT)
  - 10% chance for 5x
  - 30% chance for 2x
  - 59% chance to lose

## Setup Instructions
1. Bot requires `DISCORD_BOT_TOKEN` in secrets
2. Discord bot needs Message Content Intent enabled
3. Workflow automatically runs bot on startup
4. Database auto-initializes on first run

## Recent Changes
- 2025-11-09: Welcome System Feature
  - Added welcome channel setup command (`a welcome`)
  - Implemented on_member_join event handler
  - Welcome embeds show member count and server info
  - Updated serverinfo command to display welcome channel
  - Database schema updated to store welcome channel settings
  
- 2025-11-09: Complete bot implementation
  - Created database system with SQLite
  - Implemented 40 unique daily quests
  - Added economy system with balance tracking
  - Built gambling commands (coinflip, slot machine)
  - Added admin commands for server setup
  - All commands include emoji decorations
  - Automatic quest progress tracking via message events
  - Error handling for all commands

## User Preferences
- User requested command prefix: `a`
- All commands must include emojis
- Focus on Minecraft server integration
- Admin-only setup commands

## Architecture Notes
- Using SQLite for persistence (no external DB needed)
- Event-driven quest progress tracking
- Daily quest reset system with timezone handling
- Modular design (bot, database, quests separated)
- Comprehensive error handling with user-friendly messages

## Future Enhancements
- Minecraft mod integration for currency sync
- Server console output to Discord channel
- Real-time server status monitoring
- More quest types and gambling games
