import { createCanvas, loadImage, registerFont, Image, CanvasRenderingContext2D } from 'canvas';
import fs from 'fs/promises';
import { LOGTAIL, TWITTER } from '../config/database';

import { TweetType, WagerBetSchema, WagerSchema, WagerUser } from './types';
import getAssets from '../queries/getAssets';
import User from '../model/user';

// Register fonts
// Register fonts
// registerFont('./assets/gt-reg.ttf', { family: 'GT Pressura' });
// registerFont('./assets/gt-bold.ttf', { family: 'GT Pressura', weight: 'bold' });

registerFont('./assets/PixelOperator.ttf', { family: 'GT Pressura' });
registerFont('./assets/PixelOperator-Bold.ttf', { family: 'GT Pressura', weight: 'bold' });

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
        // LOGTAIL.error(`Error getting NFT image ${err}`) TODO: UNCOIMMENT
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



// Place bet image creation
export const createTwitterImage = async (wager: WagerSchema, publicKey: string, betAmount: number, pickedTeam: string, otherTeam: string, user?: WagerUser): Promise<Buffer> => {
    try {
        const canvas = createCanvas(1600, 900);
        const ctx = canvas.getContext('2d');

        // const text = `{} ${username || publicKey} {} picked {} ${pickedTeam} {} to beat ${otherTeam} with {} ${betAmount} DUST`;
        const text = `picked {} ${pickedTeam} {} to beat ${otherTeam} with {} ${betAmount} DUST`;
        const lines = getLines(ctx, text, 100);

        const lineHeight = 120;
        const fontSize = 120;

        const totalLineHeight = (lines.length) * (lineHeight);
    
        let textLineHeight = ((900 - totalLineHeight) / 2) + (fontSize);
        console.log(lines.length, totalLineHeight, textLineHeight)


        // Set background color
        const bgRgb = `255, 255, 255, 1`;
        ctx.fillStyle = `rgba(${bgRgb})`;

        console.log(`rgba(${bgRgb})`)
        // ctx.fillRect(700, 0, canvas.width, canvas.height);
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const nftImage = await getNFTImage(wager);
        if(!nftImage) {
            throw new Error("Could not get y00t image");
        }

        ctx.drawImage(nftImage, -292, -1, 900, 900);


        // Set text color
        const textColor = `rgba(0, 0, 0)`;

        // Add in degen picks logo
        const logo = await loadImage('./assets/logo.png');
        ctx.drawImage(logo, 1600 - 140, 900 - 140, 120, 120);

        // const textMultiplier = 0.4;

        // // Darken text color
        // for(let i = 0; i < data.length; i++) {
        //     data[i] = Math.floor(data[i] * textMultiplier);
        // }

        const usernamePfpDistance = 210;

       // Variables
        const imgX = 620;
        const imgY = textLineHeight - usernamePfpDistance;
        const imgSize = 80;
        const radius = imgSize / 2;

        // First, save the current state of the canvas
        ctx.save();

        // Draw a circle path
        ctx.beginPath();
        ctx.arc(imgX + radius, imgY + radius, radius, 0, Math.PI * 2, true);

        // Clip to the current path
        ctx.clip();

        // Draw the image in the circle
        const twitterImg = await loadImage(user?.twitterData?.profileImage || './assets/user-alt.png');
        ctx.drawImage(twitterImg, imgX, imgY, imgSize, imgSize);

        // Restore the canvas state
        ctx.restore();

        // Add in username next to image
        ctx.font = `${60}px GT Pressura`;
        ctx.fillStyle = textColor;
        ctx.fillText(user?.twitterData?.username || publicKey, 720, textLineHeight - usernamePfpDistance + 52);



        // Add in who they bet on
        ctx.font = `${fontSize}px GT Pressura`;
        ctx.fillStyle = textColor;

        let isBold = false;
        for (let i = 0; i < lines.length; i++) {
            // Draw text word by word
            const words = lines[i].split(" ");
            let startingX = 620;

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
        LOGTAIL.error(`Error creating pick image ${err}`)
        await delay(ERR_TIMEOUT);
        return await createTwitterImage(wager, publicKey, betAmount, pickedTeam, otherTeam, user);
    }
}


function wrapText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
    const words = text.split(' ');
    let line = '';
  
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = context.measureText(testLine);
      const testWidth = metrics.width;
  
      if (testWidth > maxWidth && n > 0) {
        context.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    
    context.fillText(line, x, y);
}
  
export const createInitateGameTwitterImage = async (wager: WagerSchema): Promise<Buffer> => {
    try {
        const canvas = createCanvas(1600, 900);
        const ctx = canvas.getContext('2d');

        // const description = wager.description;
        // const lines = getLines(ctx, description, 100);

        // Set background color
        const bgRgb = `255, 255, 255, 1`;
        ctx.fillStyle = `rgba(${bgRgb})`;

        console.log(`rgba(${bgRgb})`)
        // ctx.fillRect(700, 0, canvas.width, canvas.height);
        ctx.fillRect(0, 0, canvas.width, canvas.height);

       // Fetch and draw the first NFT image
        const nftImage = await getNFTImage(wager);
        if(!nftImage) {
            throw new Error("Could not get y00t image");
        }

        // Draw the first image at -450 x-axis
        ctx.drawImage(nftImage, -450, -1, 900, 900);

        // Fetch and draw the second NFT image
        const nftImage1 = await getNFTImage(wager);
        if(!nftImage1) {
            throw new Error("Could not get y00t image");
        }

        // Save current state of the canvas
        ctx.save();

        // Translate to the pivot point of the image
        ctx.translate(1600 + 450, 0);

        // Scale horizontally by -1
        ctx.scale(-1, 1);

        // Draw the second image at 0 x-axis after scaling
        ctx.drawImage(nftImage1, 0, -1, 900, 900);

        // Restore the canvas state
        ctx.restore();

       

        // Set the font size and type
        const fontSize = 60;
      

        // Align the text to center and middle
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "black";



        const newFontSize: number = 120;
        ctx.font = `bold ${newFontSize}px GT Pressura`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const newTextX: number = 1600 / 2; // center x-coordinate
        const newTextY: number = 330; // 280 pixels down from the top
        const maxWidth: number = 1100;
        const lineHeight: number = 120; // You can adjust this value


        const newText: string = wager.title;
        const lines = getLines(ctx, newText, maxWidth);
        const totalLineHeight = (lines.length) * (lineHeight);
    
        let textLineHeight = ((900 - totalLineHeight) / 2) + (fontSize);
        
        
        // Use the wrapText function
        wrapText(ctx, newText, newTextX, textLineHeight, maxWidth, lineHeight);

        ctx.font = `${fontSize}px GT Pressura`;
        
        // Calculate the position to center the text
        let textX = 1600 / 2; // center x-coordinate
        let textY = textLineHeight-123; // 180 pixels down from the top

        // Draw the text
        ctx.fillText(wager.description, textX, textY);

        // Load the logo image
        const logo = await loadImage('./assets/logo.png');

        // Calculate the position to center the logo
        const centerX = 1600 / 2 - 140 / 2; // canvas width / 2 - logo width / 2
        const centerY = textLineHeight-303; // down 20 pixels on the y-axis

        // Draw the logo
        ctx.drawImage(logo, centerX, centerY, 140, 140);

        // ctx.drawImage(nftImage, -292, -1, 900, 900);
        const imgData = canvas.toDataURL().replace(/^data:image\/\w+;base64,/, "");
        const buf = Buffer.from(imgData, "base64");
    
        return buf;

    } catch (err) {
        LOGTAIL.error(`Error creating initate image ${err}`)
        await delay(ERR_TIMEOUT);
        return await createInitateGameTwitterImage(wager);
    }
}

export const createBigWinnersImage = async (wager: WagerSchema): Promise<Buffer | null> => {
    try {
        const winningSelection = wager.selections.find((selection) => selection.winner === true);
        if(!winningSelection) {
            return null;
        }

        const winningBets = wager.placedBets.filter((bet) => JSON.stringify(bet.selectionId) === JSON.stringify(winningSelection._id));
        if(winningBets.length < 3) {
            return null;
        }

        // Calculate the sum of amounts for each winning bet
        const winningBetsWithTotal = await Promise.all(
            winningBets.map(async (bet) => {
              const totalWinAmount = bet.winAmount;
              const betUser = await User.findOne({ publicKey: bet.publicKey });
              return {
                bet,
                totalWinAmount,
                username: betUser?.twitterData?.username || formatPublicKey(bet.publicKey),
                profileImage: betUser?.twitterData?.profileImage || './assets/user-alt.png',
              };
            })
          );
          
  
        // Sort the array based on totalAmount in descending order
        const sortedBets = winningBetsWithTotal.sort((a, b) => b.totalWinAmount - a.totalWinAmount);
    
        const topThreeBets = sortedBets.slice(0, 3);

        console.log(JSON.stringify(topThreeBets, null, 2));

        const canvas = createCanvas(1600, 900);
        const ctx = canvas.getContext('2d');


        // fill it up nft images

        const bgRgb = `255, 255, 255, 1`;
        ctx.fillStyle = `rgba(${bgRgb})`;

        console.log(`rgba(${bgRgb})`)
        // ctx.fillRect(700, 0, canvas.width, canvas.height);
        ctx.fillRect(0, 0, canvas.width, canvas.height);

       // Fetch and draw the first NFT image
        const nftImage = await getNFTImage(wager);
        if(!nftImage) {
            throw new Error("Could not get y00t image");
        }

        // Draw the first image at -450 x-axis
        ctx.drawImage(nftImage, -450, -1, 900, 900);

        // Fetch and draw the second NFT image
        const nftImage1 = await getNFTImage(wager);
        if(!nftImage1) {
            throw new Error("Could not get y00t image");
        }

        // Save current state of the canvas
        ctx.save();

        // Translate to the pivot point of the image
        ctx.translate(1600 + 450, 0);

        // Scale horizontally by -1
        ctx.scale(-1, 1);

        // Draw the second image at 0 x-axis after scaling
        ctx.drawImage(nftImage1, 0, -1, 900, 900);

        // Restore the canvas state
        ctx.restore();

        // Load the logo image
        const logo = await loadImage('./assets/logo.png');

        // Calculate the position to center the logo
        const centerX = 1600 / 2 - 140 / 2; // canvas width / 2 - logo width / 2
        const centerY = 20; // down 20 pixels on the y-axis

        // Draw the logo
        ctx.drawImage(logo, centerX, centerY, 140, 140);
    
        // Align the text to center and middle
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "black";
        ctx.font = `${60}px GT Pressura`;

        // Calculate the position to center the text
        let textX = 1600 / 2; // center x-coordinate
        let textY = 210; // 180 pixels down from the top
 
         // Draw the text
        ctx.fillText(wager.description, textX, textY);

     
        ctx.font = `bold ${120}px GT Pressura`;

        ctx.fillText("Big Winners", textX, 340);

        ctx.font = `${60}px GT Pressura`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        // draw users
        let initialY = 460;
        const initialX = 453
        const radius = 80 / 2;
        for(const topBet of topThreeBets) {
            // Draw profile picture 
            // const twitterImg = await loadImage(topBet.profileImage);
            // ctx.drawImage(twitterImg, initialX, initialY, 80, 80);

            ctx.save();

            // Draw a circle path
            ctx.beginPath();
            ctx.arc(initialX + radius, initialY + radius, radius, 0, Math.PI * 2, true);

            // Clip to the current path
            ctx.clip();

            // Draw the image in the circle
            const twitterImg = await loadImage(topBet.profileImage);
            ctx.drawImage(twitterImg, initialX, initialY, 80, 80);

            // Restore the canvas state
            ctx.restore();

            ctx.fillText(topBet.username, initialX + 100, initialY + 40);

            ctx.save();

            ctx.textAlign = "right";
            ctx.textBaseline = "middle";

            // Set text color green
            ctx.fillStyle = "#43A047";
            ctx.fillText(`+ ${topBet.totalWinAmount} ${wager.token}`, initialX + 700, initialY + 40);

            ctx.restore();

            initialY+=120;
        }



        const imgData = canvas.toDataURL().replace(/^data:image\/\w+;base64,/, "");
        const buf = Buffer.from(imgData, "base64");
    
        return buf;
    } catch (err) {
         LOGTAIL.error(`Error creating big winners image ${err}`)
         await delay(ERR_TIMEOUT);
         return await createBigWinnersImage(wager);
    }
}

export const tweetImage = async (tweetType: TweetType, wager: WagerSchema, publicKey: string, betAmount: number, pickedTeam: string, otherTeam: string, user?: WagerUser) => {
    try {
        const roundedBetAmount = Math.floor(betAmount * 100) / 100;

        const formattedPublicKey = formatPublicKey(publicKey);
        const username = user?.twitterData?.username || formattedPublicKey;
        
        let imgData;
        let tweetText;
        switch(tweetType) {
            case TweetType.GAME_PICK:
                imgData =  await createTwitterImage(wager, formattedPublicKey, roundedBetAmount, pickedTeam, otherTeam, user);
                tweetText = (user?.twitterData?.username) 
                    ? `${getRandomPhrase()} @${username}\n\nYou picked ${pickedTeam} to beat ${otherTeam} with ${roundedBetAmount} $${wager.token} on @degenpicksxyz`
                    : `Wallet ${username} picked ${pickedTeam} to beat ${otherTeam} with ${roundedBetAmount} $${wager.token} on @degenpicksxyz`
                break;
            case TweetType.GAME_CREATION:
                imgData = await createInitateGameTwitterImage(wager);
                tweetText = (wager.isAdmin) 
                    ? `The @degenpicksxyz team just made a new $${wager.token} pool.` 
                    : `LFG ${username} just made a new $${wager.token} pool on @degenpicksxyz`
                break;
            case TweetType.GAME_WINNERS:
                imgData = await createBigWinnersImage(wager);
                tweetText = `Congrats to the BIG winners from this pool on @degenpicksxyz`;
                break;
            default:
                throw new Error("Invalid tweet type");
        }

        if(!imgData || !tweetText) {
            throw new Error("Could not get image data");
        }

        tweetText += `\n\nhttps://app.degenpicks.xyz/${wager._id}`;
    
        const mediaId = await TWITTER.v1.uploadMedia(imgData, { type: 'image/png' });
    
        const featuredText = getFeaturedText(wager);
        if(featuredText) {
            tweetText += `\n\n${featuredText}`;
        }
        
        await TWITTER.v2.tweet(tweetText, { media: { media_ids: [mediaId ]} });
    } catch (err) {
        console.log(`Error tweeting ${err}`)
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