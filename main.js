const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const fs = require('fs');
const config = require('./config.json');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

const commands = [
  {
    name: 'vouch',
    description: 'Submit a vouch review',
    options: [
      {
        name: 'review',
        type: 3,
        description: 'Your review',
        required: true,
      },
      {
        name: 'stars',
        type: 4,
        description: 'Rating in stars',
        required: true,
        choices: [
          { name: '5 stars', value: 5 },
          { name: '4 stars', value: 4 },
          { name: '3 stars', value: 3 },
          { name: '2 stars', value: 2 },
          { name: '1 star', value: 1 },
        ],
      },
      {
        name: 'attachment',
        type: 11,
        description: 'Optional attachment',
        required: false,
      },
    ],
  },
  {
    name: 'restore',
    description: 'Restore all vouches from information.json'
  }
];

const rest = new REST({ version: '9' }).setToken(config.token);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands },
    );
    console.log('Successfully registered application commands.');
  } catch (error) {
    console.error('Error registering application commands:', error);
  }
})();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'vouch') {
    const review = interaction.options.getString('review');
    const stars = interaction.options.getInteger('stars');
    const attachment = interaction.options.getAttachment('attachment');

    let data = [];
    if (fs.existsSync('information.json')) {
      const rawData = fs.readFileSync('information.json');
      data = JSON.parse(rawData);
    }

    const id = data.length + 1;

    const userData = {
      id: id,
      author: interaction.user.tag,
      authorId: interaction.user.id,
      avatar: interaction.user.displayAvatarURL({ dynamic: true }),
      rating: stars,
      review: review,
      timestamp: new Date().toISOString(),
      attachment: attachment ? attachment.url : null,
    };

    data.push(userData);
    fs.writeFileSync('information.json', JSON.stringify(data, null, 2));

    const starsEmoji = '⭐'.repeat(stars);

    const embed = new EmbedBuilder()
      .setTitle('New Vouch')
      .setDescription(`**Voucher:** <@${interaction.user.id}>\n**Rating:** ${starsEmoji}\n**Review:**\n\`\`\`${review}\`\`\``)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    if (attachment) {
      embed.setImage(attachment.url);
    }

    await interaction.reply({ embeds: [embed] });

    const vouchChannel = client.channels.cache.get(config.vouchChannelId);
    if (vouchChannel) {
      console.log(`Vouch channel found: ${vouchChannel.name}`);
      const botMember = interaction.guild.members.cache.get(client.user.id);
      if (botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        try {
          console.log('Attempting to update channel name...');
          await Promise.race([
            vouchChannel.setName(`${id}-vouches`),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
          ]);
          console.log(`Updated channel name to ${id}-vouches`);
        } catch (error) {
          if (error.message === 'Timeout') {
            console.error('Updating channel name timed out.');
          } else {
            console.error(`Failed to update channel name: ${error}`);
          }
        }
      } else {
        console.error('Bot does not have Manage Channels permission.');
      }
    } else {
      console.error('Vouch channel not found.');
    }
  } else if (interaction.commandName === 'restore') {
    if (interaction.user.id !== config.ownerId) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    if (fs.existsSync('information.json')) {
      await interaction.deferReply({ ephemeral: true });

      const rawData = fs.readFileSync('information.json');
      const data = JSON.parse(rawData);

      const vouchChannel = client.channels.cache.get(config.vouchChannelId);

      if (!vouchChannel) {
        return interaction.editReply({ content: 'Vouch channel not found.', ephemeral: true });
      }

      for (const userData of data) {
        const starsEmoji = '⭐'.repeat(userData.rating);

        const embed = new EmbedBuilder()
          .setTitle('New Vouch')
          .setDescription(`**Voucher:** <@${userData.authorId}>\n**Rating:** ${starsEmoji}\n**Review:**\n\`\`\`${userData.review}\`\`\``)
          .setThumbnail(userData.avatar)
          .setTimestamp(new Date(userData.timestamp));

        if (userData.attachment) {
          embed.setImage(userData.attachment);
        }

        await vouchChannel.send({ embeds: [embed] });

        await new Promise(resolve => setTimeout(resolve, 2500));
      }

      await interaction.editReply({ content: 'All vouches have been restored.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'No vouch data found to restore.', ephemeral: true });
    }
  }
});

client.login(config.token);