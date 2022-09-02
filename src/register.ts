import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from 'dotenv';

if (process.env.NODE_ENV === 'DEV') config();

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const APPLICATION_ID = process.env.APPLICATION_ID || '';

if (BOT_TOKEN === '') {
	console.error('INVALID TOKEN');
	console.log('EXITING WITH CODE 0');
	process.exit(0);
}
if (APPLICATION_ID === '') {
	console.error('INVALID Application ID');
	console.log('EXITING WITH CODE 0');
	process.exit(0);
}

const commands = [
	new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Replies with Pong')
		.addStringOption(
			option => option
				.setName('name')
				.setDescription('name of character')
				.setRequired(true),
		),
	new SlashCommandBuilder().setName('notify').setDescription('Toggle DM Notifications'),
	new SlashCommandBuilder()
		.setName('set-notify-channel')
		.setDescription('Update Notifications Channel')
		.addStringOption(
			option => option
				.setName('option')
				.setDescription('issues or prs')
				.setChoices({ name: 'issues', value: 'issues' }, { name: 'pull-requests', value: 'pull-requests' })
				.setRequired(true),
		),
	new SlashCommandBuilder()
		.setName('register')
		.setDescription('This command is used for adding github users in your mention list')
		.addStringOption(
			option => option
				.setName('username')
				.setDescription('Register Github Username for mentions')
				.setRequired(true),
		),
	new SlashCommandBuilder()
		.setName('unregister')
		.setDescription('This command is used for removing github users from your mention list')
		.addStringOption(
			option => option
				.setName('username')
				.setDescription('Remove Github Username for mentions')
				.setRequired(true),
		),
	new SlashCommandBuilder()
		.setName('get-registrations')
		.setDescription('This command returns your registered mentions'),
	new SlashCommandBuilder()
		.setName('set-admin-role')
		.setDescription('This command is used for setting the admin id')
		.addStringOption(
			option => option
				.setName('id')
				.setDescription('Role ID')
				.setRequired(true),
		),
];

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

(async () => {
	try {
		console.log('Started refreshing application (/) commands.');

		await rest.put(Routes.applicationCommands(APPLICATION_ID), { body: commands });

		console.log('Successfully reloaded application (/) commands.');
	}
	catch (error) {
		console.error(error);
	}
})();