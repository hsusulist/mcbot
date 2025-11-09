import random

QUEST_POOL = [
    {"id": 1, "name": "Chatterbox I", "description": "Send 50 messages", "type": "chat", "target": 50, "reward": 100, "emoji": "💬"},
    {"id": 2, "name": "Chatterbox II", "description": "Send 100 messages", "type": "chat", "target": 100, "reward": 250, "emoji": "💬"},
    {"id": 3, "name": "Chatterbox III", "description": "Send 200 messages", "type": "chat", "target": 200, "reward": 500, "emoji": "💬"},
    {"id": 4, "name": "Friendly Greeter", "description": "Say 'hi' or 'hello' 10 times", "type": "greeting", "target": 10, "reward": 75, "emoji": "👋"},
    {"id": 5, "name": "Social Butterfly", "description": "Mention 2 different people", "type": "mention", "target": 2, "reward": 50, "emoji": "🦋"},
    {"id": 6, "name": "Popular", "description": "Mention 5 different people", "type": "mention", "target": 5, "reward": 150, "emoji": "⭐"},
    {"id": 7, "name": "Emoji Master", "description": "Use 20 emojis in messages", "type": "emoji", "target": 20, "reward": 100, "emoji": "😀"},
    {"id": 8, "name": "Reactor", "description": "React to 10 messages", "type": "reaction", "target": 10, "reward": 80, "emoji": "👍"},
    {"id": 9, "name": "Early Bird", "description": "Send a message before 8 AM", "type": "early_bird", "target": 1, "reward": 200, "emoji": "🌅"},
    {"id": 10, "name": "Night Owl", "description": "Send a message after 10 PM", "type": "night_owl", "target": 1, "reward": 200, "emoji": "🦉"},
    {"id": 11, "name": "Question Mark", "description": "Ask 5 questions (messages with ?)", "type": "question", "target": 5, "reward": 100, "emoji": "❓"},
    {"id": 12, "name": "Exclamation!", "description": "Send 10 excited messages (with !)", "type": "exclamation", "target": 10, "reward": 100, "emoji": "❗"},
    {"id": 13, "name": "GG", "description": "Say 'gg' 5 times", "type": "gg", "target": 5, "reward": 75, "emoji": "🎮"},
    {"id": 14, "name": "LOL", "description": "Say 'lol' or laugh 10 times", "type": "laugh", "target": 10, "reward": 80, "emoji": "😂"},
    {"id": 15, "name": "Helpful Helper", "description": "Use the help command 3 times", "type": "help", "target": 3, "reward": 50, "emoji": "🆘"},
    {"id": 16, "name": "Gambler", "description": "Use coinflip 5 times", "type": "coinflip", "target": 5, "reward": 150, "emoji": "🪙"},
    {"id": 17, "name": "Risk Taker", "description": "Use gamble 3 times", "type": "gamble", "target": 3, "reward": 200, "emoji": "🎰"},
    {"id": 18, "name": "Lucky Streak", "description": "Win 3 coinflips", "type": "win_coinflip", "target": 3, "reward": 300, "emoji": "🍀"},
    {"id": 19, "name": "Long Message", "description": "Send a message with 100+ characters", "type": "long_message", "target": 1, "reward": 100, "emoji": "📝"},
    {"id": 20, "name": "Conversation Starter", "description": "Send 10 messages in different channels", "type": "different_channels", "target": 10, "reward": 150, "emoji": "💭"},
    {"id": 21, "name": "Server Booster", "description": "Check server info", "type": "server_info", "target": 1, "reward": 50, "emoji": "🚀"},
    {"id": 22, "name": "Balance Checker", "description": "Check your balance 5 times", "type": "balance", "target": 5, "reward": 75, "emoji": "💰"},
    {"id": 23, "name": "Leaderboard Viewer", "description": "Check leaderboard 3 times", "type": "leaderboard", "target": 3, "reward": 100, "emoji": "🏆"},
    {"id": 24, "name": "Quest Hunter", "description": "Check your quests 3 times", "type": "check_quest", "target": 3, "reward": 80, "emoji": "📋"},
    {"id": 25, "name": "Thanker", "description": "Say 'thanks' or 'thank you' 5 times", "type": "thanks", "target": 5, "reward": 100, "emoji": "🙏"},
    {"id": 26, "name": "Welcomer", "description": "Say 'welcome' 3 times", "type": "welcome", "target": 3, "reward": 75, "emoji": "🎉"},
    {"id": 27, "name": "Minecraft Fan", "description": "Mention 'minecraft' 5 times", "type": "minecraft", "target": 5, "reward": 150, "emoji": "⛏️"},
    {"id": 28, "name": "Builder", "description": "Say 'build' or 'building' 3 times", "type": "build", "target": 3, "reward": 100, "emoji": "🏗️"},
    {"id": 29, "name": "Miner", "description": "Say 'mine' or 'mining' 5 times", "type": "mine", "target": 5, "reward": 120, "emoji": "⚒️"},
    {"id": 30, "name": "Fighter", "description": "Say 'pvp' or 'fight' 3 times", "type": "fight", "target": 3, "reward": 100, "emoji": "⚔️"},
    {"id": 31, "name": "Trader", "description": "Say 'trade' or 'trading' 3 times", "type": "trade", "target": 3, "reward": 100, "emoji": "💱"},
    {"id": 32, "name": "Explorer", "description": "Say 'explore' or 'adventure' 3 times", "type": "explore", "target": 3, "reward": 125, "emoji": "🗺️"},
    {"id": 33, "name": "Crafter", "description": "Say 'craft' or 'crafting' 5 times", "type": "craft", "target": 5, "reward": 100, "emoji": "🔨"},
    {"id": 34, "name": "Farmer", "description": "Say 'farm' or 'farming' 5 times", "type": "farm", "target": 5, "reward": 100, "emoji": "🌾"},
    {"id": 35, "name": "Talkative", "description": "Send 30 messages in one day", "type": "chat", "target": 30, "reward": 150, "emoji": "🗣️"},
    {"id": 36, "name": "Friendly", "description": "Use 10 positive words (awesome, great, nice, etc.)", "type": "positive", "target": 10, "reward": 100, "emoji": "😊"},
    {"id": 37, "name": "Link Sharer", "description": "Share 3 links", "type": "links", "target": 3, "reward": 75, "emoji": "🔗"},
    {"id": 38, "name": "Punctual", "description": "Send 5 short messages (under 20 characters)", "type": "short_message", "target": 5, "reward": 80, "emoji": "⚡"},
    {"id": 39, "name": "Informative", "description": "Send 3 messages with 50+ characters", "type": "medium_message", "target": 3, "reward": 90, "emoji": "📚"},
    {"id": 40, "name": "Support Team", "description": "React with ❤️ or 👍 5 times", "type": "positive_reaction", "target": 5, "reward": 100, "emoji": "💝"},
]

def get_random_quests(count=5):
    return random.sample(QUEST_POOL, min(count, len(QUEST_POOL)))

def get_quest_by_id(quest_id):
    for quest in QUEST_POOL:
        if quest["id"] == quest_id:
            return quest
    return None
