import { Discord, Slash } from 'discordx';
import type { CommandInteraction } from 'discord.js';
import { Category } from '@discordx/utilities';
import type { FusionClient } from '../../Main.js';

@Discord()
@Category('Miscellaneous')
export class Server {
    /**
     * Displays server information (Fusion server).
     * @param interaction - The command interaction.
     * @param client - The Discord client.
     */
    @Slash({ description: 'Display status of the server.' })
    async server(interaction: CommandInteraction, client: FusionClient) {
        if (!interaction.channel) return;
        if (!client.monitor) return interaction.reply({ content: 'An Error Occurred!' });

        const { online, population, serverName } = client.monitor;

        await interaction.reply({
            content: `**${serverName}** is currently ${online ? '**online** ✅' : '**offline** ⛔'} with **${population}** player${population !== 1 ? 's' : ''}`,
        });
    }
}
