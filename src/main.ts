// https://discord.com/api/oauth2/authorize?client_id=1014407365614899200&permissions=8&scope=bot
import { Client, GatewayIntentBits, TextChannel, EmbedBuilder, GuildMemberRoleManager } from 'discord.js';
import { createClient } from 'redis';
import express, { Request, Response } from 'express';
import { json } from 'body-parser';
import cors from 'cors';
import fs from 'fs';
import { config } from 'dotenv';

if (process.env.NODE_ENV === 'DEV') config();
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 4567;

const redis_client = createClient();
redis_client.on('errro', (err) => {
	console.error(err);
});

if (!fs.existsSync('./data.json')) {
	fs.writeFileSync('./data.json', JSON.stringify({}));
}

// eslint-disable-next-line no-shadow
enum CHANNEL {
	issues_channel = 'issues_channel',
	pr_channel = 'pr_channel',
}

interface Users {
	[key:string] : string;
}
const users: Users = {
	e4coder: '968018497802215444',
};


const app = express();
app.use(json());
app.use(cors());

const MessageSpacer = '_ _';

type BuildMentions = (username_github: string) => Promise<{mentions: string; members: string[]}>;
const buildMentions: BuildMentions = async (username_github: string) => {
	let mentions = '';
	const members = await redis_client.SMEMBERS(username_github);
	members.forEach(val => {
		if (val) {
			mentions += `<@${val}> `;
		}
	});
	return { mentions, members };
};

(async () => {
	try {
		await redis_client.connect();
	}
	catch (err) {
		process.abort();
	}
	const discord_client = new Client({ intents: [GatewayIntentBits.Guilds] });

	discord_client.on('ready', () => {
		console.log('logged in');
	});

	discord_client.on('interactionCreate', async interaction => {
		if (!interaction.isChatInputCommand()) return;

		if (interaction.commandName === 'ping') {
			await interaction.reply('Pong! ' + interaction.options.getString('name'));
		}

		else if (interaction.commandName === 'set-notify-channel') {
			const ADMIN_ROLE_ID = await redis_client.get('ADMIN_ROLE');
			if (!ADMIN_ROLE_ID) {
				await interaction.reply('Admin Role has not been set yet');
			}
			else {
				const hasAdminRole = (interaction.member?.roles as GuildMemberRoleManager).cache.has(ADMIN_ROLE_ID);

				if (hasAdminRole) {
					const channelId = interaction.channelId;
					await redis_client.set('issues_channel', channelId);
					await interaction.reply(`This channel is now registered as the ${interaction.options.getString('option')} notification channel`);
				}
				else {
					await interaction.reply('Sorry cant let you do that, You are not an admin or admin role not set by the server owner');
				}
			}
		}

		else if (interaction.commandName === 'register') {
			const username_discord = interaction.user.username;
			const username_discord_id = interaction.user.id;
			const username_github = interaction.options.getString('username');
			if (username_github) {
				try {
					await redis_client.SADD(username_github, username_discord_id);
					await redis_client.SADD(username_discord, username_github);
					await interaction.reply('Registered');
				}
				catch (error) {
					await redis_client.SREM(username_github, username_discord_id);
					await redis_client.SREM(username_discord, username_github);
					await interaction.reply('Registeration Failed');
				}
			}
		}

		else if (interaction.commandName === 'unregister') {
			const username_discord = interaction.user.username;
			const username_discord_id = interaction.user.id;
			const username_github = interaction.options.getString('username');
			if (username_github) {
				try {
					await redis_client.SREM(username_github, username_discord_id);
					await redis_client.SADD(username_discord, username_github);
					await interaction.reply('Removed');
				}
				catch (error) {
					await redis_client.SREM(username_github, username_discord_id);
					await redis_client.SREM(username_discord, username_github);
					await interaction.reply('Failed');
				}
			}
		}

		else if (interaction.commandName === 'get-registrations') {
			try {
				const registrations = await redis_client.SMEMBERS(interaction.user.username);
				let message = '';
				registrations.forEach(val => {
					message += `${val}\n`;
				});
				if (message === '') {
					await interaction.reply('You dont have any registrations');
				}
				else {
					await interaction.reply(message);
				}
			}
			catch (error) {
				await interaction.reply('Something went wrong! try again later');
			}
		}

		else if (interaction.commandName === 'set-admin-role') {
			const ownerID = interaction.guild?.ownerId;
			if (interaction.user.id !== ownerID) {
				interaction.reply('This is an only owner command');
			}
			else {
				const RoleID = interaction.options.getString('id');
				if (RoleID) {
					await redis_client.set('ADMIN_ROLE', RoleID);
				}
				interaction.reply('Successfully updated ADMIN ROLE ID');
			}

		}
	});

	await discord_client.login(BOT_TOKEN);

	app.get('/', (req: Request, res: Response) => {
		res.status(200).json({ status: 'working' });
	});

	app.post('/pull-requests', (req: Request, res: Response) => {
		if (req.headers['x-github-event'] === 'pull_request') {
			const action = req.body.action;
			console.log(action);
		}
		res.end();
	});

	app.post('/issues', async (req: Request, res: Response) => {
		console.log('Incoming Request');
		console.log(req.headers['x-github-event']);
		if (req.headers['x-github-event'] === 'issues') {
			const action = req.body.action;
			const URL = req.body.issue.html_url;
			const TITLE = req.body.issue.title;
			const Number = req.body.issue.number;
			const Author = req.body.issue.user.login;
			const AuthorAvatar = req.body.issue.user.avatar_url;
			const AuthorUrl = req.body.issue.user.url;
			const channelId = await redis_client.get(CHANNEL.issues_channel);

			if (!channelId) {
				console.log('Channel ID not set');
				return res.end();
			}

			if (action === 'opened') {
				const exampleEmbed = new EmbedBuilder()
					// .setColor(0x0099FF)
					.setColor('Gold')
					.setTitle(TITLE)
					.setURL(URL)
					.setAuthor({ name: Author, iconURL: AuthorAvatar, url: AuthorUrl })
					.addFields({ name: '\u200B', value: '\u200B' })
					.addFields({ name: 'New Issue Created by', value: Author, inline: true })
					.setImage(URL)
					.setTimestamp()
					.setFooter({ text: 'HailBot', iconURL: 'https://i.imgur.com/AfFp7pu.png' });

				const message = `\`\`\`\n\`\`\`**ISSUE Created**: ${TITLE}\nissue number : ${Number}\n${URL}`;

				// await (discord_client.channels.cache.get(channelId) as TextChannel).send('_ _');
				(discord_client.channels.cache.get(channelId) as TextChannel)
					.send({ embeds: [exampleEmbed], content: message }).then(val => {
						console.log('sent message');
					}).catch(err => console.error(err));

			}

			else if (action === 'closed') {
				const message = `\`\`\`\n\`\`\`**ISSUE Closed**: ${TITLE}\nissue number : ${Number}\n${URL}`;

				// await (discord_client.channels.cache.get(channelId) as TextChannel).send('_ _');
				(discord_client.channels.cache.get(channelId) as TextChannel)
					.send({ content: message }).then(val => {
						console.log('sent message');
					}).catch(err => console.error(err));
			}

			else if (action === 'assigned') {
				const assignee = req.body.assignee;
				const assignee_name = assignee.login;
				const exampleEmbed = new EmbedBuilder()
					// .setColor(0x0099FF)
					.setColor('DarkGreen')
					.setTitle(TITLE)
					.setURL(URL)
					.setAuthor({ name: Author, iconURL: AuthorAvatar, url: AuthorUrl })
					.addFields({ name: '\u200B', value: '\u200B' })
					.addFields({ name: 'Issue assigned to', value: assignee_name })
					.setThumbnail(assignee.avatar_url)
					.setImage(URL)
					.setTimestamp()
					.setFooter({ text: 'HailBot', iconURL: 'https://i.imgur.com/AfFp7pu.png' });

				const { mentions, members } = await buildMentions(assignee_name);

				const message = `\`\`\`\n\`\`\`**ISSUE Assigned**: ${TITLE}\nissue has been assigned to **${assignee_name}**\nissue number : ${Number}\n${URL}\n${mentions}`;

				// await (discord_client.channels.cache.get(channelId) as TextChannel).send('_ _');
				(discord_client.channels.cache.get(channelId) as TextChannel)
					.send({ embeds: [exampleEmbed], content: message }).then(val => {
						console.log('sent message');
					}).catch(err => console.error(err));

			}
			else if (action === 'unassigned') {
				const assignee = req.body.assignee;
				const assignee_name = assignee.login;
				const exampleEmbed = new EmbedBuilder()
					// .setColor(0x0099FF)
					.setColor('DarkRed')
					.setTitle(TITLE)
					.setURL(URL)
					.setAuthor({ name: Author, iconURL: AuthorAvatar, url: AuthorUrl })
					.addFields({ name: '\u200B', value: '\u200B' })
					.addFields({ name: 'Issue assigned to', value: assignee_name, inline: false })
					.setThumbnail(assignee.avatar_url)
					.setTimestamp()
					.setFooter({ text: 'HailBot', iconURL: 'https://i.imgur.com/AfFp7pu.png' });

				const { mentions, members } = await buildMentions(assignee_name);

				const message = `\`\`\`\n\`\`\`**ISSUE UnAssigned**: ${TITLE}\n**${assignee_name}** has been removed from the issue\n**issue number : ${Number}\n${URL}\n${mentions}`;

				// await (discord_client.channels.cache.get(channelId) as TextChannel).send('_ _');
				(discord_client.channels.cache.get(channelId) as TextChannel)
					.send({ embeds: [exampleEmbed], content: message }).then(val => {
						console.log('sent message');
					}).catch(err => console.error(err));

			}
		}
		else {
			console.log('wrong event or wrong header');
		}
		res.end();
	});

	app.listen(PORT, () => {
		console.log(`listening on PORT ${PORT}`);
	});
})();

