# Discord Bot - Mc-SBot-1

## Overview
This is a Discord bot project running on Replit. The bot is built with Python using the discord.py library.

## Project Structure
- `bot.py` - Main bot file containing all bot commands and event handlers
- `requirements.txt` - Python dependencies (managed by uv)
- `.gitignore` - Git ignore file for Python projects

## Setup
1. The bot requires a Discord Bot Token stored in the `DISCORD_BOT_TOKEN` secret
2. Dependencies are automatically managed by uv package manager
3. The bot runs continuously via the configured workflow

## Bot Features
Current commands:
- `!ping` - Check bot latency
- `!hello` - Greet the user

## How to Add Your Bot Code
Replace the content in `bot.py` with your custom Discord bot code. Make sure to keep:
- The `DISCORD_BOT_TOKEN` environment variable usage
- The discord.py library imports

## Recent Changes
- 2025-11-08: Initial setup with basic Discord bot structure
- Added discord.py and python-dotenv dependencies
- Created basic bot commands (ping, hello)
