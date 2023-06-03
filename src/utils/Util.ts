import type { Message } from 'discord.js';
import { Client } from 'discordx';
import 'colors';
import net from 'net';
import { ActivityType, ChannelType, codeBlock } from 'discord.js';
import words from '../bannedWords.json' assert { type: 'json' };

/**
 * Capitalises the first letter of each word in a string.
 * @param string - The string to be capitalised.
 * @returns The capitalised string.
 */
export function capitalise(string: string) {
    return string.replace(/\S+/g, (word) => word.slice(0, 1).toUpperCase() + word.slice(1));
}

/**
 * Checks if a message is deletable, and deletes it after a specified amount of time.
 * @param message - The message to check.
 * @param time - The amount of time to wait before deleting the message, in milliseconds.
 * @returns void
 */
export function deletableCheck(message: Message, time: number): void {
    setTimeout(() => {
        if (message && message.deletable) {
            message.delete().catch(console.error);
        }
    }, time);
}

/**
 * Fetches the registered global application commands and returns an object
 * containing the command names as keys and their corresponding IDs as values.
 * @param client - The Discord Client instance.
 * @returns An object containing command names and their corresponding IDs.
 * If there are no commands or an error occurs, an empty object is returned.
 */
export async function getCommandIds(client: Client) {
    try {
        // Fetch the registered global application commands
        const commands = await client.application?.commands.fetch();

        if (!commands) {
            return {};
        }

        // Create an object to store the command IDs
        const commandIds: { [name: string]: string } = {};

        commands.forEach((command) => {
            commandIds[command.name] = command.id;
        });

        return commandIds;
    } catch (error) {
        console.error('Error fetching global commands:', error);
        return {};
    }
}

/**
 * Connects to the FusionFall monitor and processes the received data.
 * @param client - The Discord client instance.
 * @returns void
 */
export async function connectFusionFall(client: Client): Promise<void> {
    let online: boolean;
    let population = 0;

    const debug = false;

    let ip = process.env.Ip || '127.0.0.1';
    if (!ip.includes(':')) ip += ':8003';

    let buffer: string[] = [];

    const options: net.NetConnectOpts = {
        port: parseInt(ip.split(':')[1], 10),
        host: ip.split(':')[0],
    };

    console.log('[INFO]'.red.bold, `Connecting to monitor at ${ip}...`.white.bold);

    let socket = net.connect(options, () => {
        console.log('[INFO]'.red.bold, 'Connected.'.green.bold);
        online = true;
    });

    socket.on('data', onData);
    socket.on('error', onErr);
    socket.on('end', onEnd);

    /**
     * Handles the received data from the FusionFall monitor.
     * @param data - The received data as a Buffer.
     * @returns void
     */
    function onData(data: Buffer): void {
        const tokens = data.toString().split('\n');

        tokens.forEach((token) => {
            if (token.length > 0) buffer.push(token);
        });

        if (buffer.includes('end')) {
            processBuffer();
        }
    }

    /**
     * Refreshes the status of the bot's activity based on the online status and population.
     * @returns void
     */
    function refreshStatus(): void {
        if (online) {
            client.user?.setActivity(
                `${population} players`,
                {
                    type: ActivityType.Watching,
                },
            );
        } else {
            client.user?.setActivity(
                '0 players',
                {
                    type: ActivityType.Watching,
                },
            );
        }
    }

    /**
     * Handles the error event of the socket connection.
     * @returns void
     */
    function onErr(): void {
        online = false;
        setTimeout(attemptReconnect, 10000);
    }

    /**
     * Handles the end event of the socket connection.
     * @returns void
     */
    function onEnd(): void {
        console.log('[WARN]'.red.bold, 'Lost connection to monitor.'.white.bold);
        online = false;
        setTimeout(attemptReconnect, 10000);
    }

    /**
     * Attempts to reconnect to the FusionFall monitor.
     * @returns void
     */
    function attemptReconnect(): void {
        console.log('Attempting to reconnect...'.white.bold);

        if (!debug) refreshStatus();
        socket = net.connect(options, () => {
            console.log('Reconnected.'.green.bold);
            online = true;
        });

        socket.on('error', onErr);
        socket.on('data', onData);
        socket.on('end', onEnd);
    }

    /**
     * Prints the buffer content for debugging purposes.
     * @param data - The buffer content to print.
     * @returns void
     */
    function printBuffer(data: string[]): void {
        console.log('{');
        for (let i = 0; i < data.length; i += 1) {
            console.log(data[i]);
        }
        console.log('}');
    }

    /**
     * Processes the buffer data received from the FusionFall monitor.
     * @returns void
     */
    function processBuffer(): void {
        if (debug) printBuffer(buffer);
        if (buffer.includes('begin')) {
            const queue = buffer.slice(buffer.indexOf('begin') + 1, buffer.indexOf('end'));
            population = 0;
            for (let i = 0; i < queue.length; i += 1) {
                const channel = client.channels.cache.get(`${process.env.ChannelId}`);
                const staffChannel = process.env.StaffChannelId ? client.channels.cache.get(`${process.env.StaffChannelId}`) : null;
                if (!channel || channel.type !== ChannelType.GuildText) return;

                const tokens = queue[i].split(' ');
                const head = queue[i].substring(queue[i].indexOf(' ') + 1);
                let body = '\n```\n';
                let j: number;
                switch (tokens[0]) {
                case 'player':
                    population += 1;
                    break;
                case 'chat': {
                    if (!debug) {
                        const cnt = queue[i].substring(queue[i].indexOf(' ') + 1);
                        const chatRegex = /^\[(.*?)](?: \((.*?)\))? (.*?) \[(.*?)]?: (.*)/;
                        const match = cnt.match(chatRegex);

                        if (!match) {
                            break;
                        }

                        const [, , role, username, identifier, message] = match;

                        if (message.startsWith('/') || message.length < 3 || message.startsWith('redeem')) {
                            break;
                        }

                        if (words.length) {
                            const messageWords = message.toLowerCase().split(' ');
                            const hasBannedWord = words.some((word) => messageWords.includes(word.toLowerCase()));

                            if (hasBannedWord) {
                                if (staffChannel) channel.send(`**Usage of blocked word:**\n${codeBlock('text', cnt)}`);
                                break;
                            }
                        }

                        const formattedMessage = `**[${match[1]}]**${role ? ` *(${role})*` : ''} ${username} ${identifier ? `*[${identifier}]*` : ''}: \`${message}\``;
                        channel.send(formattedMessage);
                    }
                    break;
                }
                case 'email':
                    for (j = 1; queue[i + j][0] === '\t'; j += 1) {
                        body += `${queue[i + j].substring(1)}\n`;
                    }
                    body += '```';
                    if (!debug) channel.send(head + body);
                    if (!queue[i + j].includes('endemail')) console.log('[WARN]'.red.bold, 'Bad email (no endemail)'.white.bold);
                    i += j;
                    break;
                default:
                    console.log('[WARN]'.red.bold, `Unknown token: ${tokens[0]}`.red.bold);
                    break;
                }
            }
            if (!debug) refreshStatus();
        } else {
            console.log('[WARN]'.red.bold, 'Bad data (no begin); ignoring'.white.bold);
        }
        buffer = buffer.slice(buffer.indexOf('end') + 1, buffer.length);
    }
}
