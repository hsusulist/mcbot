import discord
from discord.ext import commands
import os
import random
from datetime import datetime, timedelta
from database import Database
from quests import get_random_quests, get_quest_by_id, QUEST_POOL
from dotenv import load_dotenv

load_dotenv()

intents = discord.Intents.default()
intents.message_content = True
intents.members = True
intents.reactions = True

bot = commands.Bot(command_prefix='a ', intents=intents, help_command=None)
db = Database()

user_mentions_tracker = {}
user_message_times = {}
user_channels_tracker = {}

async def update_quest(user_id, username, quest_id, increment=1, channel=None):
    """Helper function to update quest progress and handle completion"""
    quest = get_quest_by_id(quest_id)
    if not quest:
        return
    
    quests, _ = db.get_daily_quests(user_id)
    if quest_id not in quests:
        return
    
    progress, completed = db.get_quest_progress(user_id, quest_id)
    
    if completed:
        return
    
    new_progress = progress + increment
    
    if new_progress >= quest["target"]:
        db.update_quest_progress(user_id, quest_id, new_progress, 1)
        db.update_balance(user_id, quest["reward"])
        
        if channel:
            embed = discord.Embed(
                title=f"🎉 Quest Completed!",
                description=f"**{quest['emoji']} {quest['name']}**\n{quest['description']}",
                color=discord.Color.gold()
            )
            embed.add_field(name="💰 Reward", value=f"+{quest['reward']} coins", inline=False)
            embed.set_footer(text=f"Great job, {username}!")
            
            await channel.send(embed=embed)
    else:
        db.update_quest_progress(user_id, quest_id, new_progress, 0)

@bot.event
async def on_ready():
    print(f'🤖 {bot.user} has connected to Discord!')
    print(f'📊 Bot is in {len(bot.guilds)} guilds')
    print(f'✅ Ready to serve!')

@bot.event
async def on_member_join(member):
    settings = db.get_server_settings(member.guild.id)
    
    if not settings:
        return
    
    welcome_channel_id = settings[4] if len(settings) > 4 else None
    welcome_enabled = settings[6] if len(settings) > 6 else 1
    
    if not welcome_channel_id or not welcome_enabled:
        return
    
    channel = member.guild.get_channel(welcome_channel_id)
    
    if not channel:
        return
    
    member_count = member.guild.member_count
    
    embed = discord.Embed(
        title="👋 Welcome to the Server!",
        description=f"Hey {member.mention}, welcome to **{member.guild.name}**!",
        color=discord.Color.blue()
    )
    embed.set_thumbnail(url=member.display_avatar.url)
    embed.add_field(
        name="👥 Member Count",
        value=f"You are member **#{member_count}**!",
        inline=False
    )
    embed.add_field(
        name="🎮 Get Started",
        value=f"Use `a help` to see all available commands and start your adventure!",
        inline=False
    )
    embed.set_footer(text=f"Welcome to {member.guild.name}!", icon_url=member.guild.icon.url if member.guild.icon else None)
    embed.timestamp = datetime.now()
    
    await channel.send(embed=embed)

@bot.event
async def on_reaction_add(reaction, user):
    if user.bot:
        return
    
    user_id = user.id
    username = str(user)
    db.get_user(user_id, username)
    
    quests, _ = db.get_daily_quests(user_id)
    
    for quest_id in quests:
        quest = get_quest_by_id(quest_id)
        if not quest:
            continue
        
        progress, completed = db.get_quest_progress(user_id, quest_id)
        
        if completed:
            continue
        
        if quest["type"] == "reaction":
            new_progress = progress + 1
            if new_progress >= quest["target"]:
                db.update_quest_progress(user_id, quest_id, new_progress, 1)
                db.update_balance(user_id, quest["reward"])
                
                channel = reaction.message.channel
                embed = discord.Embed(
                    title=f"🎉 Quest Completed!",
                    description=f"**{quest['emoji']} {quest['name']}**\n{quest['description']}",
                    color=discord.Color.gold()
                )
                embed.add_field(name="💰 Reward", value=f"+{quest['reward']} coins", inline=False)
                embed.set_footer(text=f"Great job, {username}!")
                
                await channel.send(embed=embed)
            else:
                db.update_quest_progress(user_id, quest_id, new_progress, 0)
        elif quest["type"] == "positive_reaction" and str(reaction.emoji) in ["❤️", "👍", "💖", "💕", "💗"]:
            new_progress = progress + 1
            if new_progress >= quest["target"]:
                db.update_quest_progress(user_id, quest_id, new_progress, 1)
                db.update_balance(user_id, quest["reward"])
                
                channel = reaction.message.channel
                embed = discord.Embed(
                    title=f"🎉 Quest Completed!",
                    description=f"**{quest['emoji']} {quest['name']}**\n{quest['description']}",
                    color=discord.Color.gold()
                )
                embed.add_field(name="💰 Reward", value=f"+{quest['reward']} coins", inline=False)
                embed.set_footer(text=f"Great job, {username}!")
                
                await channel.send(embed=embed)
            else:
                db.update_quest_progress(user_id, quest_id, new_progress, 0)

@bot.event
async def on_message(message):
    if message.author.bot:
        return
    
    user_id = message.author.id
    username = str(message.author)
    content = message.content.lower()
    
    db.get_user(user_id, username)
    
    quests, last_reset = db.get_daily_quests(user_id)
    
    if datetime.now() - last_reset > timedelta(days=1):
        db.reset_quest_progress(user_id)
        quests = [q["id"] for q in get_random_quests(5)]
        db.set_daily_quests(user_id, quests)
        
        if user_id in user_mentions_tracker:
            user_mentions_tracker[user_id] = set()
        if user_id in user_channels_tracker:
            user_channels_tracker[user_id] = set()
    
    if not quests:
        quests = [q["id"] for q in get_random_quests(5)]
        db.set_daily_quests(user_id, quests)
    
    for quest_id in quests:
        quest = get_quest_by_id(quest_id)
        if not quest:
            continue
        
        progress, completed = db.get_quest_progress(user_id, quest_id)
        
        if completed:
            continue
        
        new_progress = progress
        
        if quest["type"] == "chat":
            new_progress = progress + 1
        elif quest["type"] == "greeting" and any(word in content for word in ["hi", "hello", "hey"]):
            new_progress = progress + 1
        elif quest["type"] == "mention" and message.mentions:
            if user_id not in user_mentions_tracker:
                user_mentions_tracker[user_id] = set()
            for mention in message.mentions:
                user_mentions_tracker[user_id].add(mention.id)
            new_progress = len(user_mentions_tracker[user_id])
        elif quest["type"] == "emoji":
            emoji_count = sum(1 for char in message.content if char in "😀😁😂🤣😃😄😅😆😉😊😋😎😍😘🥰😗😙😚☺️🙂🤗🤩🤔🤨😐😑😶🙄😏😣😥😮🤐😯😪😫🥱😴😌😛😜😝🤤😒😓😔😕🙃🤑😲☹️🙁😖😞😟😤😢😭😦😧😨😩🤯😬😰😱🥵🥶😳🤪😵😡😠🤬😷🤒🤕🤢🤮🤧😇🤠🤡🤥🤫🤭🧐🤓")
            new_progress = progress + emoji_count
        elif quest["type"] == "question" and "?" in message.content:
            new_progress = progress + 1
        elif quest["type"] == "exclamation" and "!" in message.content:
            new_progress = progress + 1
        elif quest["type"] == "gg" and "gg" in content:
            new_progress = progress + 1
        elif quest["type"] == "laugh" and any(word in content for word in ["lol", "lmao", "haha", "hehe"]):
            new_progress = progress + 1
        elif quest["type"] == "long_message" and len(message.content) >= 100:
            new_progress = progress + 1
        elif quest["type"] == "thanks" and any(word in content for word in ["thanks", "thank you", "thx", "ty"]):
            new_progress = progress + 1
        elif quest["type"] == "welcome" and "welcome" in content:
            new_progress = progress + 1
        elif quest["type"] == "minecraft" and "minecraft" in content:
            new_progress = progress + 1
        elif quest["type"] == "build" and any(word in content for word in ["build", "building"]):
            new_progress = progress + 1
        elif quest["type"] == "mine" and any(word in content for word in ["mine", "mining"]):
            new_progress = progress + 1
        elif quest["type"] == "fight" and any(word in content for word in ["pvp", "fight", "fighting"]):
            new_progress = progress + 1
        elif quest["type"] == "trade" and any(word in content for word in ["trade", "trading"]):
            new_progress = progress + 1
        elif quest["type"] == "explore" and any(word in content for word in ["explore", "adventure"]):
            new_progress = progress + 1
        elif quest["type"] == "craft" and any(word in content for word in ["craft", "crafting"]):
            new_progress = progress + 1
        elif quest["type"] == "farm" and any(word in content for word in ["farm", "farming"]):
            new_progress = progress + 1
        elif quest["type"] == "early_bird":
            hour = datetime.now().hour
            if hour < 8:
                new_progress = 1
        elif quest["type"] == "night_owl":
            hour = datetime.now().hour
            if hour >= 22:
                new_progress = 1
        elif quest["type"] == "different_channels":
            if user_id not in user_channels_tracker:
                user_channels_tracker[user_id] = set()
            user_channels_tracker[user_id].add(message.channel.id)
            new_progress = len(user_channels_tracker[user_id])
        elif quest["type"] == "positive" and any(word in content for word in ["awesome", "great", "nice", "good", "amazing", "fantastic", "wonderful", "excellent", "perfect", "lovely"]):
            new_progress = progress + 1
        elif quest["type"] == "links" and ("http://" in message.content or "https://" in message.content):
            new_progress = progress + 1
        elif quest["type"] == "short_message" and len(message.content) < 20:
            new_progress = progress + 1
        elif quest["type"] == "medium_message" and 50 <= len(message.content) < 100:
            new_progress = progress + 1
        
        if new_progress >= quest["target"] and not completed:
            db.update_quest_progress(user_id, quest_id, new_progress, 1)
            db.update_balance(user_id, quest["reward"])
            
            embed = discord.Embed(
                title=f"🎉 Quest Completed!",
                description=f"**{quest['emoji']} {quest['name']}**\n{quest['description']}",
                color=discord.Color.gold()
            )
            embed.add_field(name="💰 Reward", value=f"+{quest['reward']} coins", inline=False)
            embed.set_footer(text=f"Great job, {username}!")
            
            await message.channel.send(embed=embed)
        elif new_progress != progress:
            db.update_quest_progress(user_id, quest_id, new_progress, 0)
    
    await bot.process_commands(message)

@bot.command(name='setup')
@commands.has_permissions(administrator=True)
async def setup(ctx, server_ip: str, server_port: int):
    """🔧 Setup the Minecraft server IP and port (Admin only)"""
    db.set_server_settings(ctx.guild.id, server_ip=server_ip, server_port=server_port)
    
    embed = discord.Embed(
        title="✅ Server Setup Complete!",
        description=f"Minecraft server configured successfully",
        color=discord.Color.green()
    )
    embed.add_field(name="🌐 Server IP", value=server_ip, inline=True)
    embed.add_field(name="🔌 Port", value=server_port, inline=True)
    embed.set_footer(text=f"Set by {ctx.author}")
    
    await ctx.send(embed=embed)

@bot.command(name='setupchannel')
@commands.has_permissions(administrator=True)
async def setupchannel(ctx, channel: discord.TextChannel = None):
    """📺 Setup console channel for server logs (Admin only)"""
    if channel is None:
        channel = ctx.channel
    
    db.set_server_settings(ctx.guild.id, console_channel_id=channel.id)
    
    embed = discord.Embed(
        title="✅ Console Channel Configured!",
        description=f"Server console will output to {channel.mention}",
        color=discord.Color.green()
    )
    embed.set_footer(text=f"Set by {ctx.author}")
    
    await ctx.send(embed=embed)

@bot.command(name='welcome')
@commands.has_permissions(administrator=True)
async def welcome_cmd(ctx, action: str = None, channel: discord.TextChannel = None):
    """👋 Manage welcome system (Admin only)"""
    if action is None:
        if channel is None:
            channel = ctx.channel
        
        db.set_server_settings(ctx.guild.id, welcome_channel_id=channel.id)
        
        embed = discord.Embed(
            title="✅ Welcome Channel Configured!",
            description=f"New members will be welcomed in {channel.mention}",
            color=discord.Color.green()
        )
        embed.add_field(
            name="📋 What happens next?",
            value="When someone joins the server, they'll receive a welcome message with the member count!",
            inline=False
        )
        embed.set_footer(text=f"Set by {ctx.author}")
        
        await ctx.send(embed=embed)
    
    elif action.lower() == "on":
        db.set_server_settings(ctx.guild.id, welcome_enabled=1)
        
        embed = discord.Embed(
            title="✅ Welcome System Enabled!",
            description="New members will receive welcome messages",
            color=discord.Color.green()
        )
        embed.set_footer(text=f"Enabled by {ctx.author}")
        
        await ctx.send(embed=embed)
    
    elif action.lower() == "off":
        db.set_server_settings(ctx.guild.id, welcome_enabled=0)
        
        embed = discord.Embed(
            title="⏸️ Welcome System Disabled",
            description="New members will not receive welcome messages",
            color=discord.Color.orange()
        )
        embed.set_footer(text=f"Disabled by {ctx.author}")
        
        await ctx.send(embed=embed)
    
    elif action.lower() == "status":
        settings = db.get_server_settings(ctx.guild.id)
        
        if not settings:
            await ctx.send("❌ Server not configured! Ask an admin to use `a welcome #channel`")
            return
        
        welcome_enabled = settings[6] if len(settings) > 6 else 1
        welcome_channel_id = settings[4] if len(settings) > 4 else None
        
        status = "✅ Enabled" if welcome_enabled else "❌ Disabled"
        channel_info = f"<#{welcome_channel_id}>" if welcome_channel_id else "Not configured"
        
        embed = discord.Embed(
            title="👋 Welcome System Status",
            color=discord.Color.blue()
        )
        embed.add_field(name="Status", value=status, inline=True)
        embed.add_field(name="Channel", value=channel_info, inline=True)
        embed.set_footer(text=f"Requested by {ctx.author}")
        
        await ctx.send(embed=embed)

@bot.command(name='console')
@commands.has_permissions(administrator=True)
async def console_cmd(ctx, action: str = "status"):
    """📺 Manage console logging (Admin only)"""
    if action.lower() == "on":
        db.set_server_settings(ctx.guild.id, console_enabled=1)
        
        embed = discord.Embed(
            title="✅ Console Logging Enabled!",
            description="Console output will be sent to Discord",
            color=discord.Color.green()
        )
        embed.add_field(
            name="📋 Note",
            value="Make sure you have the Minecraft server mod configured!",
            inline=False
        )
        embed.set_footer(text=f"Enabled by {ctx.author}")
        
        await ctx.send(embed=embed)
    
    elif action.lower() == "off":
        db.set_server_settings(ctx.guild.id, console_enabled=0)
        
        embed = discord.Embed(
            title="⏸️ Console Logging Disabled",
            description="Console output will not be sent to Discord",
            color=discord.Color.orange()
        )
        embed.set_footer(text=f"Disabled by {ctx.author}")
        
        await ctx.send(embed=embed)
    
    elif action.lower() == "status":
        settings = db.get_server_settings(ctx.guild.id)
        
        if not settings:
            await ctx.send("❌ Server not configured! Ask an admin to use `a setupchannel`")
            return
        
        console_enabled = settings[5] if len(settings) > 5 else 1
        console_channel_id = settings[3] if len(settings) > 3 else None
        
        status = "✅ Enabled" if console_enabled else "❌ Disabled"
        channel_info = f"<#{console_channel_id}>" if console_channel_id else "Not configured"
        
        embed = discord.Embed(
            title="📺 Console Logging Status",
            color=discord.Color.blue()
        )
        embed.add_field(name="Status", value=status, inline=True)
        embed.add_field(name="Channel", value=channel_info, inline=True)
        embed.set_footer(text=f"Requested by {ctx.author}")
        
        await ctx.send(embed=embed)

@bot.command(name='balance', aliases=['bal', 'money'])
async def balance(ctx, member: discord.Member = None):
    """💰 Check your balance or someone else's"""
    if member is None:
        member = ctx.author
    
    user_id = member.id
    username = str(member)
    db.get_user(user_id, username)
    
    await update_quest(user_id, username, 22, 1, ctx.channel)
    
    user_balance = db.get_balance(user_id)
    
    embed = discord.Embed(
        title=f"💰 {member.display_name}'s Balance",
        description=f"**{user_balance:,}** coins",
        color=discord.Color.gold()
    )
    embed.set_thumbnail(url=member.display_avatar.url)
    embed.set_footer(text=f"Requested by {ctx.author}")
    
    await ctx.send(embed=embed)

@bot.command(name='profile', aliases=['stats', 'me'])
async def profile(ctx, member: discord.Member = None):
    """📊 View your profile or someone else's"""
    if member is None:
        member = ctx.author
    
    user_id = member.id
    username = str(member)
    user = db.get_user(user_id, username)
    
    balance = user[2]
    total_earned = user[4]
    total_spent = user[5]
    
    quests, _ = db.get_daily_quests(user_id)
    completed_quests = sum(1 for q_id in quests if db.get_quest_progress(user_id, q_id)[1] == 1)
    
    embed = discord.Embed(
        title=f"📊 {member.display_name}'s Profile",
        color=discord.Color.blue()
    )
    embed.set_thumbnail(url=member.display_avatar.url)
    embed.add_field(name="💰 Balance", value=f"{balance:,} coins", inline=True)
    embed.add_field(name="📈 Total Earned", value=f"{total_earned:,} coins", inline=True)
    embed.add_field(name="📉 Total Spent", value=f"{total_spent:,} coins", inline=True)
    embed.add_field(name="✅ Quests Completed Today", value=f"{completed_quests}/5", inline=True)
    embed.set_footer(text=f"Requested by {ctx.author}")
    
    await ctx.send(embed=embed)

@bot.command(name='leaderboard', aliases=['lb', 'top'])
async def leaderboard(ctx):
    """🏆 View the richest players"""
    await update_quest(ctx.author.id, str(ctx.author), 23, 1, ctx.channel)
    
    top_users = db.get_leaderboard(10)
    
    if not top_users:
        await ctx.send("❌ No users found in the leaderboard!")
        return
    
    embed = discord.Embed(
        title="🏆 Richest Players Leaderboard",
        description="Top 10 wealthiest members",
        color=discord.Color.gold()
    )
    
    medals = ["🥇", "🥈", "🥉"]
    
    for idx, (user_id, username, balance) in enumerate(top_users):
        medal = medals[idx] if idx < 3 else f"#{idx + 1}"
        embed.add_field(
            name=f"{medal} {username}",
            value=f"💰 {balance:,} coins",
            inline=False
        )
    
    embed.set_footer(text=f"Requested by {ctx.author}")
    
    await ctx.send(embed=embed)

@bot.command(name='quests', aliases=['quest', 'daily'])
async def quests(ctx):
    """📋 View your daily quests"""
    user_id = ctx.author.id
    username = str(ctx.author)
    db.get_user(user_id, username)
    
    await update_quest(user_id, username, 24, 1, ctx.channel)
    
    quests, last_reset = db.get_daily_quests(user_id)
    
    if datetime.now() - last_reset > timedelta(days=1):
        db.reset_quest_progress(user_id)
        quests = [q["id"] for q in get_random_quests(5)]
        db.set_daily_quests(user_id, quests)
        
        if user_id in user_mentions_tracker:
            user_mentions_tracker[user_id] = set()
        if user_id in user_channels_tracker:
            user_channels_tracker[user_id] = set()
    
    if not quests:
        quests = [q["id"] for q in get_random_quests(5)]
        db.set_daily_quests(user_id, quests)
    
    embed = discord.Embed(
        title="📋 Your Daily Quests",
        description="Complete these to earn coins!",
        color=discord.Color.blue()
    )
    
    for quest_id in quests:
        quest = get_quest_by_id(quest_id)
        if not quest:
            continue
        
        progress, completed = db.get_quest_progress(user_id, quest_id)
        
        status = "✅ Completed" if completed else f"📊 Progress: {progress}/{quest['target']}"
        
        embed.add_field(
            name=f"{quest['emoji']} {quest['name']}",
            value=f"{quest['description']}\n{status}\n💰 Reward: {quest['reward']} coins",
            inline=False
        )
    
    time_until_reset = timedelta(days=1) - (datetime.now() - last_reset)
    hours, remainder = divmod(int(time_until_reset.total_seconds()), 3600)
    minutes, _ = divmod(remainder, 60)
    
    embed.set_footer(text=f"Resets in {hours}h {minutes}m")
    
    await ctx.send(embed=embed)

@bot.command(name='cf', aliases=['coinflip', 'flip'])
async def coinflip(ctx, amount: int, choice: str):
    """🪙 Coinflip gambling - Double or nothing!"""
    user_id = ctx.author.id
    username = str(ctx.author)
    db.get_user(user_id, username)
    
    choice = choice.lower()
    if choice not in ['heads', 'head', 'h', 'tails', 'tail', 't']:
        await ctx.send("❌ Please choose 'heads' or 'tails'!")
        return
    
    if amount <= 0:
        await ctx.send("❌ Amount must be positive!")
        return
    
    user_balance = db.get_balance(user_id)
    if user_balance < amount:
        await ctx.send(f"❌ You don't have enough coins! Your balance: {user_balance:,} coins")
        return
    
    await update_quest(user_id, username, 16, 1, ctx.channel)
    
    result = random.choice(['heads', 'tails'])
    user_choice_normalized = 'heads' if choice in ['heads', 'head', 'h'] else 'tails'
    
    won = result == user_choice_normalized
    
    if won:
        db.update_balance(user_id, amount)
        new_balance = db.get_balance(user_id)
        
        await update_quest(user_id, username, 18, 1, ctx.channel)
        
        embed = discord.Embed(
            title="🎉 You Won!",
            description=f"The coin landed on **{result}**!",
            color=discord.Color.green()
        )
        embed.add_field(name="💰 Winnings", value=f"+{amount:,} coins", inline=True)
        embed.add_field(name="💳 New Balance", value=f"{new_balance:,} coins", inline=True)
    else:
        db.update_balance(user_id, -amount)
        new_balance = db.get_balance(user_id)
        
        embed = discord.Embed(
            title="😢 You Lost!",
            description=f"The coin landed on **{result}**!",
            color=discord.Color.red()
        )
        embed.add_field(name="💸 Lost", value=f"-{amount:,} coins", inline=True)
        embed.add_field(name="💳 New Balance", value=f"{new_balance:,} coins", inline=True)
    
    embed.set_footer(text=f"{ctx.author}")
    
    await ctx.send(embed=embed)

@bot.command(name='gamble', aliases=['slots', 'slot'])
async def gamble(ctx, amount: int):
    """🎰 Gamble with slot machine - 1/100 chance for x100!"""
    user_id = ctx.author.id
    username = str(ctx.author)
    db.get_user(user_id, username)
    
    if amount <= 0:
        await ctx.send("❌ Amount must be positive!")
        return
    
    user_balance = db.get_balance(user_id)
    if user_balance < amount:
        await ctx.send(f"❌ You don't have enough coins! Your balance: {user_balance:,} coins")
        return
    
    await update_quest(user_id, username, 17, 1, ctx.channel)
    
    roll = random.randint(1, 100)
    
    emojis = ["🍒", "🍋", "🍊", "🍇", "⭐", "💎", "7️⃣"]
    slots = [random.choice(emojis) for _ in range(3)]
    
    if roll == 1:
        winnings = amount * 100
        db.update_balance(user_id, winnings)
        new_balance = db.get_balance(user_id)
        
        embed = discord.Embed(
            title="🎰 JACKPOT! 💰",
            description=f"{' '.join(['💎', '💎', '💎'])}\n\n**YOU HIT THE JACKPOT!**",
            color=discord.Color.gold()
        )
        embed.add_field(name="🎉 Winnings", value=f"+{winnings:,} coins (x100!)", inline=True)
        embed.add_field(name="💳 New Balance", value=f"{new_balance:,} coins", inline=True)
    elif roll <= 10:
        winnings = amount * 5
        db.update_balance(user_id, winnings)
        new_balance = db.get_balance(user_id)
        
        embed = discord.Embed(
            title="🎰 Big Win!",
            description=f"{' '.join(slots)}\n\nYou won big!",
            color=discord.Color.green()
        )
        embed.add_field(name="💰 Winnings", value=f"+{winnings:,} coins (x5!)", inline=True)
        embed.add_field(name="💳 New Balance", value=f"{new_balance:,} coins", inline=True)
    elif roll <= 30:
        winnings = amount * 2
        db.update_balance(user_id, winnings)
        new_balance = db.get_balance(user_id)
        
        embed = discord.Embed(
            title="🎰 You Won!",
            description=f"{' '.join(slots)}\n\nNice!",
            color=discord.Color.blue()
        )
        embed.add_field(name="💰 Winnings", value=f"+{winnings:,} coins (x2!)", inline=True)
        embed.add_field(name="💳 New Balance", value=f"{new_balance:,} coins", inline=True)
    else:
        db.update_balance(user_id, -amount)
        new_balance = db.get_balance(user_id)
        
        embed = discord.Embed(
            title="🎰 You Lost!",
            description=f"{' '.join(slots)}\n\nBetter luck next time!",
            color=discord.Color.red()
        )
        embed.add_field(name="💸 Lost", value=f"-{amount:,} coins", inline=True)
        embed.add_field(name="💳 New Balance", value=f"{new_balance:,} coins", inline=True)
    
    embed.set_footer(text=f"{ctx.author}")
    
    await ctx.send(embed=embed)

@bot.command(name='help')
async def help_command(ctx):
    """🆘 Shows all available commands"""
    await update_quest(ctx.author.id, str(ctx.author), 15, 1, ctx.channel)
    
    embed = discord.Embed(
        title="🤖 Minecraft Server Bot - Help",
        description="Here are all my commands! Use `a` as the prefix.",
        color=discord.Color.purple()
    )
    
    embed.add_field(
        name="⚙️ Admin Commands",
        value="`a setup <ip> <port>` - Setup Minecraft server\n"
              "`a setupchannel [#channel]` - Set console channel\n"
              "`a welcome [#channel]` - Set welcome channel\n"
              "`a welcome on/off/status` - Toggle welcome system\n"
              "`a console on/off/status` - Toggle console logging\n"
              "`a give @user <amount>` - Give coins to user",
        inline=False
    )
    
    embed.add_field(
        name="💰 Economy Commands",
        value="`a balance [@user]` - Check balance\n"
              "`a profile [@user]` - View profile\n"
              "`a leaderboard` - Top 10 richest",
        inline=False
    )
    
    embed.add_field(
        name="📋 Quest Commands",
        value="`a quests` - View daily quests\n"
              "`a daily` - Same as quests",
        inline=False
    )
    
    embed.add_field(
        name="🎰 Gambling Commands",
        value="`a cf <amount> <heads/tails>` - Coinflip (2x)\n"
              "`a gamble <amount>` - Slot machine (up to 100x!)",
        inline=False
    )
    
    embed.add_field(
        name="ℹ️ Info Commands",
        value="`a help` - Shows this message\n"
              "`a ping` - Check bot latency\n"
              "`a serverinfo` - View server info",
        inline=False
    )
    
    embed.set_footer(text="💡 Tip: Complete daily quests to earn coins!")
    
    await ctx.send(embed=embed)

@bot.command(name='ping')
async def ping(ctx):
    """🏓 Check bot latency"""
    embed = discord.Embed(
        title="🏓 Pong!",
        description=f"Latency: **{round(bot.latency * 1000)}ms**",
        color=discord.Color.green()
    )
    await ctx.send(embed=embed)

@bot.command(name='serverinfo', aliases=['server'])
async def serverinfo(ctx):
    """📊 View Minecraft server information"""
    await update_quest(ctx.author.id, str(ctx.author), 21, 1, ctx.channel)
    
    settings = db.get_server_settings(ctx.guild.id)
    
    if not settings:
        await ctx.send("❌ Server not configured! Ask an admin to use `a setup`")
        return
    
    _, server_ip, server_port, console_channel_id, welcome_channel_id = settings
    
    embed = discord.Embed(
        title="⛏️ Minecraft Server Info",
        color=discord.Color.green()
    )
    
    if server_ip:
        embed.add_field(name="🌐 Server IP", value=server_ip, inline=True)
    if server_port:
        embed.add_field(name="🔌 Port", value=server_port, inline=True)
    if console_channel_id:
        channel = ctx.guild.get_channel(console_channel_id)
        if channel:
            embed.add_field(name="📺 Console Channel", value=channel.mention, inline=False)
    if welcome_channel_id:
        channel = ctx.guild.get_channel(welcome_channel_id)
        if channel:
            embed.add_field(name="👋 Welcome Channel", value=channel.mention, inline=False)
    
    embed.set_footer(text=f"Requested by {ctx.author}")
    
    await ctx.send(embed=embed)

@bot.command(name='give')
@commands.has_permissions(administrator=True)
async def give(ctx, member: discord.Member, amount: int):
    """💸 Give coins to a user (Admin only)"""
    if amount <= 0:
        await ctx.send("❌ Amount must be positive!")
        return
    
    user_id = member.id
    username = str(member)
    db.get_user(user_id, username)
    db.update_balance(user_id, amount)
    
    new_balance = db.get_balance(user_id)
    
    embed = discord.Embed(
        title="✅ Coins Given!",
        description=f"Gave **{amount:,}** coins to {member.mention}",
        color=discord.Color.green()
    )
    embed.add_field(name="💳 New Balance", value=f"{new_balance:,} coins", inline=True)
    embed.set_footer(text=f"Given by {ctx.author}")
    
    await ctx.send(embed=embed)

@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.MissingPermissions):
        embed = discord.Embed(
            title="❌ Permission Denied",
            description="You don't have permission to use this command!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
    elif isinstance(error, commands.MissingRequiredArgument):
        embed = discord.Embed(
            title="❌ Missing Argument",
            description=f"Missing required argument: `{error.param.name}`\nUse `a help` for command info.",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
    elif isinstance(error, commands.BadArgument):
        embed = discord.Embed(
            title="❌ Invalid Argument",
            description="Please check your command arguments!\nUse `a help` for command info.",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
    elif isinstance(error, commands.CommandNotFound):
        pass
    else:
        print(f"Error: {error}")

if __name__ == '__main__':
    token = os.getenv('DISCORD_BOT_TOKEN')
    if not token:
        print('❌ ERROR: DISCORD_BOT_TOKEN not found in environment variables!')
        print('📝 Please add your Discord bot token using the Secrets tool.')
        exit(1)
    
    print('🚀 Starting bot...')
    bot.run(token)
