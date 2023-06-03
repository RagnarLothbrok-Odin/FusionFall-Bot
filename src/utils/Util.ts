import type { Message } from 'discord.js';
import { Client } from 'discordx';
import 'colors';
import net from 'net';
import {
    ActivityType, ChannelType, codeBlock,
} from 'discord.js';
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
 * Class representing a connection to the FusionFall monitor.
 */
export class FusionFallMonitor {
    public online: boolean;

    public population: number;

    public serverName: string;

    private words: string[];

    private client: Client;

    private readonly ip: string;

    private buffer: string[];

    private readonly options: net.NetConnectOpts;

    private socket: net.Socket;

    private readonly debug: boolean;

    constructor(client: Client) {
        this.client = client;
        this.debug = false;
        this.online = false;
        this.population = 0;
        this.serverName = process.env.ServerName || 'N/A';
        this.words = words;
        this.ip = process.env.Ip || '127.0.0.1';
        if (!this.ip.includes(':')) this.ip += ':8003';
        this.buffer = [];
        this.options = {
            port: parseInt(this.ip.split(':')[1], 10),
            host: this.ip.split(':')[0],
        };
        this.socket = new net.Socket();
    }

    public async connect() {
        console.log('[INFO]'.red.bold, `Connecting to monitor at ${this.ip}...`.white.bold);

        this.socket = net.connect(this.options, () => {
            console.log('[INFO]'.red.bold, 'Connected.'.green.bold);
            this.online = true;
        });

        this.socket.on('data', this.onData.bind(this));
        this.socket.on('error', this.onErr.bind(this));
        this.socket.on('end', this.onEnd.bind(this));
    }

    private onData(data: Buffer): void {
        const tokens = data.toString().split('\n');
        tokens.forEach((token) => {
            if (token.length > 0) this.buffer.push(token);
        });
        if (this.buffer.includes('end')) {
            this.processBuffer();
        }
    }

    private refreshStatus(): void {
        const activityText = this.online ? `${this.population} player${this.population !== 1 ? 's' : ''}` : '0 players';

        this.client.user?.setActivity(activityText, {
            type: ActivityType.Watching,
        });
    }

    private onErr(): void {
        this.online = false;
        setTimeout(this.attemptReconnect.bind(this), 10000);
    }

    private onEnd(): void {
        console.log('[WARN]'.red.bold, 'Lost connection to monitor.'.white.bold);
        this.online = false;
        setTimeout(this.attemptReconnect.bind(this), 10000);
    }

    private attemptReconnect(): void {
        console.log('Attempting to reconnect...'.white.bold);
        if (!this.debug) this.refreshStatus();
        this.socket = net.connect(this.options, () => {
            console.log('Reconnected.'.green.bold);
            this.online = true;
        });
        this.socket.on('error', this.onErr.bind(this));
        this.socket.on('data', this.onData.bind(this));
        this.socket.on('end', this.onEnd.bind(this));
    }

    private printBuffer(data: string[]): void {
        console.log('{');
        for (let i = 0; i < data.length; i += 1) {
            console.log(data[i]);
        }
        console.log('}');
    }

    private processBuffer(): void {
        if (this.debug) this.printBuffer(this.buffer);
        if (this.buffer.includes('begin')) {
            const queue = this.buffer.slice(this.buffer.indexOf('begin') + 1, this.buffer.indexOf('end'));
            this.population = 0;

            for (let i = 0; i < queue.length; i += 1) {
                const channel = this.client.channels.cache.get(`${process.env.ChannelId}`);
                const staffChannel = process.env.StaffChannelId ? this.client.channels.cache.get(`${process.env.StaffChannelId}`) : null;

                if (!channel || channel.type !== ChannelType.GuildText) return;

                const tokens = queue[i].split(' ');
                const head = queue[i].substring(queue[i].indexOf(' ') + 1);
                let body = '\n```\n';
                let j: number;

                switch (tokens[0]) {
                case 'player':
                    this.population += 1;
                    break;
                case 'chat': {
                    if (!this.debug) {
                        const cnt = queue[i].substring(queue[i].indexOf(' ') + 1);
                        const chatRegex = /^\[(.*?)](?: \((.*?)\))? (.*?) \[(.*?)]?: (.*)/;
                        const match = cnt.match(chatRegex);

                        if (!match) {
                            break;
                        }

                        const [, , role, username, identifier, message] = match;

                        const blockedWords = this.words.filter((word) => message.toLowerCase().includes(word.toLowerCase()));

                        if (blockedWords.length > 0) {
                            if (staffChannel && (staffChannel.type === ChannelType.GuildText)) {
                                staffChannel.send(`**Usage of blocked word:**\n${codeBlock('text', cnt)}`);
                            }
                            break;
                        }

                        if (message.length < 3 || message.startsWith('/') || message.startsWith('redeem')) {
                            break;
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
                    if (!this.debug) channel.send(head + body);
                    if (!queue[i + j].includes('endemail')) console.log('[WARN]'.red.bold, 'Bad email (no endemail)'.white.bold);
                    i += j;
                    break;
                default:
                    console.log('[WARN]'.red.bold, `Unknown token: ${tokens[0]}`.red.bold);
                    break;
                }
            }
            if (!this.debug) this.refreshStatus();
        } else {
            console.log('[WARN]'.red.bold, 'Bad data (no begin); ignoring'.white.bold);
        }
        this.buffer = this.buffer.slice(this.buffer.indexOf('end') + 1, this.buffer.length);
    }
}
