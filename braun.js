const fs = require('fs');

const ytdl = require('youtube-dl');
const ffmpeg = require('ffmpeg');
const ascii = require('image-to-ascii');

const { Client, MessageEmbed } = require('discord.js');
const client = new Client();

const PREFIX = 'b!';
const HEX = 0xf8cc37;
const FOOTER = 'Mr. Braun';
const GITHUB = 'https://github.com/lanpai/mr-braun';
const TOKEN = process.env.TOKEN;
const VIDEO_FILE = './video.mp4';
const FRAMES_DIR = './frames/';
const FRAME_RATE = 0.8;
const PIXELS = '   ░░░▒▒▓▓███';

var isBusy = false;
var isPlaying = false;

var connection;

function Sleep(ms) {
    return new Promise((res) => {
        setTimeout(res, ms);
    });
}

function CreateEmbed(content) {
    return new MessageEmbed()
            .setColor(HEX)
            .setDescription(content)
            .setAuthor(FOOTER, client.user.displayAvatarURL(), GITHUB);
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setPresence({
        status: 'dnd',
        activity: {
            name: '📺',
            type: 'WATCHING'
        }
    });
});

client.on('message', async (msg) => {
    const args = msg.content.split(' ');

    switch (args[0]) {
        case PREFIX + 'play':
            if (isBusy) {
                msg.channel.send(CreateEmbed('Currently busy!'));
                return;
            }
            if (isPlaying) {
                msg.channel.send(CreateEmbed(`Currently playing! (**${PREFIX}stop** to stop)`));
            }


            const URL = args[1];

            // Check if URL is a valid YouTube link
            if (!/^(https?\:\/\/)?((youtu\.be\/.{11,})|((www\.)?(youtube\.com\/watch\?v=.{11,})))$/.test(URL)) {
                msg.channel.send(CreateEmbed('Not a valid YouTube video URL!'));
                return;
            }
            
            let embed = await msg.channel.send(CreateEmbed(`Searching: ${URL}`));
            
            isBusy = true;

            // Download YouTube video
            let video = ytdl(URL);
            let size;
            let title;

            video.on('error', (err) => {
                isBusy = false;
                isPlaying = false;
                if (err.stderr === 'WARNING: Unable to extract video title\nERROR: Video unavailable')
                    embed.edit(CreateEmbed('Not a valid YouTube video URL!'));
                else {
                    embed.edit(CreateEmbed('Unknown error!'));
                    console.log(err);
                }
            });

            video.on('info', (info) => {
                size = info.size;
                title = info.title;
                embed.edit(CreateEmbed(`Downloading: ${URL} (${Math.floor(size/100000)/10}M)`));
            });

            video.pipe(fs.createWriteStream(VIDEO_FILE));

            video.on('end', async () => {
                embed.edit(CreateEmbed(`Extracting frames: ${URL} (${Math.floor(size/100000)/10}M)`));

                // Extracting frames
                fs.rmdirSync(FRAMES_DIR, { recursive: true });
                let ffmpegVideo = await new ffmpeg(VIDEO_FILE);
                await ffmpegVideo.fnExtractFrameToJPG(FRAMES_DIR, {
                    frame_rate: FRAME_RATE,
                    file_name: '%s',
                    size: '61x34'
                });
                const frames = fs.readdirSync(FRAMES_DIR);
                frames.sort((a, b) => {
                    let A = Number(a.match(/([0-9]+)x([0-9]+)_([0-9]+)\.jpg/)[3]);
                    let B = Number(b.match(/([0-9]+)x([0-9]+)_([0-9]+)\.jpg/)[3]);
                    return A - B;
                });

                // Ignore first frame
                frames.shift();

                // Turn frames into ASCII
                embed.edit(CreateEmbed(`Rendering frames: ${URL} (${Math.floor(size/100000)/10}M)`));
                function EditFrame(i) {
                    return new Promise((res) => {
                        [ file, x, y, n ] = frames[i].match(/([0-9]+)x([0-9]+)_([0-9]+)\.jpg/);
                        const aspect = Number(y)/(2*Number(x));
                        const X = 61;
                        const Y = Math.floor(aspect*X);

                        let start = Date.now();
                        ascii(FRAMES_DIR + frames[i], {
                            size: {
                                height: Y,
                            },
                            preserve_aspect_ratio: false,
                            stringify: true,
                            colored: false,
                            pixels: PIXELS
                        }, (err, conv) => {
                            if (!err)
                                frames[i] = conv;
                            res();
                        });
                    });
                }
                let promises = [];
                for (let i = 0; i < frames.length; i++) promises.push(EditFrame(i));
                await Promise.all(promises);

                isBusy = false;
                isPlaying = true;

                // Play audio
                if (connection)
                    connection.play(VIDEO_FILE);

                // Play frames
                async function PlayFrame(frame) {
                    embed.edit(CreateEmbed('```' + frame + '```').setFooter(title));
                }
                for (let frame of frames) {
                    if (!isPlaying) break;
                    PlayFrame(frame);
                    await Sleep(1000/FRAME_RATE);
                }

                isPlaying = false;

            });
            break;
        case PREFIX + 'stop':
            if (isBusy) {
                msg.channel.send(CreateEmbed('Currently busy!'));
                return;
            }
            if (isPlaying) {
                isPlaying = false;
                if (connection)
                    connection.play('');
                msg.channel.send(CreateEmbed('Stopped playback'));
                return;
            }
            msg.channel.send('Not currently playing!');
            break;
        case PREFIX + 'connect':
            if (msg.member.voice.channel) {
                connection = await msg.member.voice.channel.join();
                msg.channel.send(CreateEmbed(`Connected audio to ${msg.member.voice.channel}`));
            }
            else {
                msg.channel.send(CreateEmbed('You need to connect to a voice channel first!'));
            }
            break;
        case PREFIX + 'disconnect':
            if (connection) {
                msg.channel.send(CreateEmbed(`Disconnected audio from ${connection.channel}`));
                connection.disconnect();
                connection = null;
            }
            else {
                msg.channel.send(CreateEmbed('Audio is not connected to a voice channel!'));
            }
            break;
        case PREFIX + 'help':
            msg.channel.send(CreateEmbed('')
                    .addField(PREFIX + 'play (YouTube URL)', 'Starts playback for given video')
                    .addField(PREFIX + 'stop', 'Stops current playback')
                    .addField(PREFIX + 'connect', 'Connects audio to current voice channel')
                    .addField(PREFIX + 'disconnect', 'Disconnects audio'));
            break;
        default:
            if (args[0].substring(0, PREFIX.length) === PREFIX) {
                msg.channel.send(CreateEmbed('Invalid Command!'));
            }
            break;
    }
});

client.login(TOKEN);
