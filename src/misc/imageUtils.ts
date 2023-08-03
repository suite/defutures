import { createCanvas, loadImage, registerFont, Image, CanvasRenderingContext2D } from 'canvas';
import fs from 'fs/promises';
import { LOGTAIL, TWITTER } from '../config/database';

import { WagerSchema } from './types';
import getAssets from '../queries/getAssets';

// Register fonts
registerFont('./assets/gt-reg.ttf', { family: 'GT Pressura' });
registerFont('./assets/gt-bold.ttf', { family: 'GT Pressura', weight: 'bold' });


// TODO: replace with utils
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const ERR_TIMEOUT = 1500;
const RETRY_AMOUNT = 5;

const PHRASES = [
    "Good luck,",
    "Nice one,",
    "Well played,",
    "FIWB,",
    "Cheers,",
    "Fuck OK,",
    "Look at you,",
    "Hold onto your nips,", 
    "Congratulations,"
];

const BG_TEXT_COLORS: { [rgb: string]: string } = {
    "238, 229, 211": "103, 82, 40",
    "226, 234, 235": "57, 83, 86",
    "239, 225, 206": "109, 74, 34",
    "241, 240, 226": "96, 93, 46",
    "242, 240, 235": "89, 80, 54",
    "220, 228, 215": "70, 85, 58",
    "243, 224, 214": "111, 60, 32",
    "239, 235, 231": "86, 71, 57",
    "243, 235, 214": "113, 88, 30",
    "240, 234, 218": "101, 85, 41"
}

// bad y00ts!
const BANNED_Y00TS = [
    70,
    1427,
    2800,
    2953,
    3073,
    3379,
    4093,
    4437,
    5278,
    5394,
    7779,
    8076,
    8103,
    8121,
    8208,
    9320,
    9451,
    9574,
    10910,
    13593,
    14070,
    14628
]

function randomIntFromInterval(min: number, max: number) { // min and max included 
    return Math.floor(Math.random() * (max - min + 1) + min)
}

const getRandomPhrase = () => {
    return PHRASES[randomIntFromInterval(0, (PHRASES.length-1) || 0)];
}

const getY00tID = (): number => {
    // if metadata has y00t.ids, or y00t.traits,
    let y00tID = -1;
    while(y00tID === -1) {
        const randomNum = Math.floor(Math.random() * 1500);
        if(BANNED_Y00TS.includes(randomNum + 1)) {
            continue;
        }

        y00tID = randomNum;
    }

    return y00tID;
}

const getY00tImage = async (): Promise<Image | null> => {
    let retries = 0;
    while(retries < RETRY_AMOUNT) {
        retries++;

        try {
            const randomNum = getY00tID();
            const imageUrl = `https://metadata.y00ts.com/y/${randomNum}.png`;
            const y00tImage = await loadImage(imageUrl);

            return y00tImage;
        } catch (err) {
            // Sleep for 1500 ms
            console.log(err)
            await delay(ERR_TIMEOUT);
        }
    }

    return null;
}

const getImageWithRetry = async (imageUrl: string): Promise<Image | null> => {
    let retries = 0;
    while(retries < RETRY_AMOUNT) {
        retries++;

        try {
            return await loadImage(imageUrl);;
        } catch (err) {
            // Sleep for 1500 ms
            console.log(err)
            await delay(ERR_TIMEOUT);
        }
    }

    return null;
}

// const getMetaDataWithRetry = async (isDe: boolean, id: number): Promise<any | null> => {
//     const dataUrl = isDe 
//         ? `https://metadata.degods.com/g/${id}.json` 
//         : `https://metadata.y00ts.com/y/${id}.json`;

//     let retries = 0;
//     while(retries < RETRY_AMOUNT) {
//         retries++;

//         try {
//             const response = await fetch(dataUrl);
//             const data = await response.json();
//             return data;
//         } catch (err) {
//             // Sleep for 1500 ms
//             console.log(err)
//             await delay(ERR_TIMEOUT);
//         }
//     }

//     return null;
// }

const getCustomUrlImage = async (custom_urls: Array<string>): Promise<Image | null> => {
    // Get random url from custom_urls
    const randomUrl = custom_urls[randomIntFromInterval(0, (custom_urls.length-1) || 0)];
    return await getImageWithRetry(randomUrl); 
}


// TODO: build out getting y00t/de image, see where 
const getImageFromIds = async (ids: Array<number>, isDe: boolean): Promise<Image | null> => {
    const imageId = ids[randomIntFromInterval(0, (ids.length-1) || 0)];
    const imageUrl = isDe 
        ? `https://metadata.degods.com/g/${imageId}-dead.png` 
        : `https://metadata.y00ts.com/y/${imageId}.png`;

    return await getImageWithRetry(imageUrl);
}


const getNFTImage = async (wager: WagerSchema): Promise<Image | null> => {
    try {
        // TODO: Implement these
        // const hasY00tTraits = wager.metadata.find((meta: any) => meta.y00t && meta.y00t.traits);
        // const hasDeTraits = wager.metadata.find((meta: any) => meta.de && meta.de.traits);
    
        // check if metadata exists
        if(!wager.metadata) {
            return await getY00tImage();
        }

        const hasY00tIds = wager.metadata.find((meta: any) => meta.y00t && meta.y00t.ids);
        const hasDeIds = wager.metadata.find((meta: any) => meta.de && meta.de.ids);

        if(hasY00tIds || hasDeIds) {
            return await getImageFromIds(hasY00tIds ? hasY00tIds.y00t.ids : hasDeIds.de.ids, !!hasDeIds);
        }

        const hasCustomUrls = wager.metadata.find((meta: any) => meta.custom_urls);
        if(hasCustomUrls) {
            return await getCustomUrlImage(hasCustomUrls.custom_urls);
        }

        const wagerCollection = wager.collectionName;
        if(wagerCollection) {
            const assets = await getAssets();
            const leagueObj = assets.find((asset) => asset.league === wagerCollection);

            const customUrls = leagueObj?.options.map(
                (option: any) => option.imageUrl
            );

            return await getCustomUrlImage(customUrls!); 
        }


        // If none else, just get random y00t
        return await getY00tImage();
    } catch (err) {
        console.log(`Error getting NFT image: ${err}`);
        LOGTAIL.error(`Error getting NFT image ${err}`)
        return null;
    }
}

const getFeaturedText = (wager: WagerSchema): string => {
    const hasFeaturedText = wager.metadata?.find((meta: any) => meta.featured_text);
    if(hasFeaturedText) {
        return hasFeaturedText.featured_text;
    }

    return '';
}

const formatPublicKey = (publicKey: string) => {
    let slice1 = publicKey.slice(0, 4);
    let slice2 = publicKey.slice(publicKey.length - 4, publicKey.length);
    return slice1 + "..." + slice2;
}

const getLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    var words = text.split(" ");
    var lines = [];
    var currentLine = words[0];

    let height = 0;

    for (var i = 1; i < words.length; i++) {
        var word = words[i];
        var width = ctx.measureText(currentLine.replace(" {} ", " ") + " " + word.replace(" {} ", " ")).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

const workingColors = new Set();
export const createTwitterImage = async (wager: WagerSchema, publicKey: string, betAmount: number, pickedTeam: string, otherTeam: string, username?: string): Promise<Buffer> => {
    try {
        const canvas = createCanvas(1600, 900);
        const ctx = canvas.getContext('2d');

        const text = `{} ${username || publicKey} {} picked {} ${pickedTeam} {} to beat ${otherTeam} with {} ${betAmount} DUST`;
        const lines = getLines(ctx, text, 100);

        const lineHeight = 100;
        const fontSize = 90;

        const totalLineHeight = (lines.length) * (lineHeight);
    
        let textLineHeight = ((900 - totalLineHeight) / 2) + (fontSize);
        console.log(lines.length, totalLineHeight, textLineHeight)

        const nftImage = await getNFTImage(wager);
        if(!nftImage) {
            throw new Error("Could not get y00t image");
        }

        ctx.drawImage(nftImage, -200, 0, 900, 900);

        // Get background color
        const { data } = ctx.getImageData(0, 450, 1, 1);

        // Set background color
        const bgRgb = `${data[0]}, ${data[1]}, ${data[2]}`;
        ctx.fillStyle = `rgba(${bgRgb})`;

        console.log(`rgba(${bgRgb})`)
        // ctx.fillRect(700, 0, canvas.width, canvas.height);
        ctx.fillRect(1600, 0, canvas.width, canvas.height);

        // Set text color
        const textColor = `rgba(${BG_TEXT_COLORS[bgRgb] || "0, 0, 0"})`;

        if(!BG_TEXT_COLORS[bgRgb]) {
            console.log("Could not find text color for", bgRgb)
        } else {
            console.log(`working rgba(${bgRgb})`);
            workingColors.add(bgRgb);
        }

        // Add in degen picks logo
        const logo = await loadImage('./assets/logo.png');
        ctx.drawImage(logo, 1600 - 140, 900 - 140, 120, 120);

        // const textMultiplier = 0.4;

        // // Darken text color
        // for(let i = 0; i < data.length; i++) {
        //     data[i] = Math.floor(data[i] * textMultiplier);
        // }

        // Add in who they bet on
        ctx.font = `${fontSize}px GT Pressura`;
        ctx.fillStyle = textColor;

        let isBold = false;
        for (let i = 0; i < lines.length; i++) {
            // Draw text word by word
            const words = lines[i].split(" ");
            let startingX = 600;

            for (let j = 0; j < words.length; j++) {
                const word = words[j];

                if (word === "{}") {
                    isBold = !isBold;
                    continue;
                }

                if (isBold) {
                    ctx.font = `bold ${fontSize}px GT Pressura`;
                } else {
                    ctx.font = `${fontSize}px GT Pressura`;
                }

                ctx.fillText(word, startingX, textLineHeight);
                
                const width = ctx.measureText(word).width;
                startingX += width + 15;
            }

            textLineHeight += lineHeight;
        }

        // ctx.font = ctx.font = `bold ${fontSize}px GT Pressura`;
        // ctx.fillStyle = 'black';
        // ctx.fillText(`${betAmount} DUST`, 600, textLineHeight);
        

        const imgData = canvas.toDataURL().replace(/^data:image\/\w+;base64,/, "");
        const buf = Buffer.from(imgData, "base64");
    
        return buf;
    } catch (err) {
        LOGTAIL.error(`Error creating image ${err}`)
        await delay(ERR_TIMEOUT);
        return await createTwitterImage(wager, publicKey, betAmount, pickedTeam, otherTeam, username);
    }
}

export const tweetImage = async (wager: WagerSchema, publicKey: string, betAmount: number, pickedTeam: string, otherTeam: string, username?: string) => {
    try {
        const roundedBetAmount = Math.floor(betAmount * 100) / 100;

        const formattedPublicKey = formatPublicKey(publicKey);
        
        const imgData = await createTwitterImage(wager, formattedPublicKey, roundedBetAmount, pickedTeam, otherTeam, username);
    
        const mediaId = await TWITTER.v1.uploadMedia(imgData, { type: 'image/png' });
    
        let tweetText;
        const featuredText = getFeaturedText(wager);

        if(username) {
            tweetText = `${getRandomPhrase()} @${username}\n\nYou picked ${pickedTeam} to beat ${otherTeam} with ${roundedBetAmount} $DUST on degenpicks.xyz ${featuredText}`;
        } else {
            tweetText = `Wallet ${formattedPublicKey} picked ${pickedTeam} to beat ${otherTeam} with ${roundedBetAmount} $DUST on degenpicks.xyz ${featuredText}`;
        }
        
        await TWITTER.v2.tweet(tweetText, { media: { media_ids: [mediaId ]} });
    } catch (err) {
        LOGTAIL.error(`Error tweeting ${err}`)
    }

}

/* TODO:
    - Add it "feat." text to the tweet - check if works
    - Make sure homepageNft's are implemened on frontend (get games organized)
    - Test creating game with metadata
    - Test image bot
    - Create script to get certain ids

*/