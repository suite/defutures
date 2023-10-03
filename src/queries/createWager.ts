import { AGENDA, LIVE_GAME_CAP, LOGTAIL, TOKEN_MAP } from "../config/database";
import { TweetType, WagerSchema, WagerUser } from "../misc/types";
import createWagerEscrows from "./createWagerEscrows";
import Wager from '../model/wager';
import { ServerError } from "../misc/serverError";
import { countAllLiveOrUpcomingGames, countLiveGames, countLiveGamesForUser, is14DaysAdvance } from "../misc/utils";
import getAssets from "./getAssets";
import { tweetImage } from "../misc/imageUtils";

export function getUTCTime(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
}

const startWagerWalletCreation = async (wager: WagerSchema) => {
    try {
        const createdEscrows = await createWagerEscrows(wager);
        if(!createdEscrows) {
            // Delete wager if error
            await Wager.findByIdAndDelete(wager._id);
    
            LOGTAIL.error(`Error creating wager escrows for ${wager._id}`)
        }
    } catch (err) {
        LOGTAIL.error(`Error running create wager escrows for ${wager._id}`)
    }  
}

export default async function createWager(title: string,
    description: string, // fine
    league: string, // set collection name
    collectionName: string,
    selection1: string, 
    selection1Record: string,
    selection2: string, 
    selection2Record: string,
    gameDate: number, creator: WagerUser, token: string, info: string): Promise<WagerSchema | ServerError> {

    try {   
        if(![...Object.keys(TOKEN_MAP), "SOL"].includes(token)) throw new ServerError("Invalid token.");

        // Check game cap
        const liveGameCount = await countAllLiveOrUpcomingGames();

        if(liveGameCount === null) throw new ServerError("Unable to get live game count.");
        if(liveGameCount >= LIVE_GAME_CAP) throw new ServerError("Game cap reached.");

        // Check if admin game
        const isAdmin = creator.roles.includes("ADMIN");

        // Date check
        if(!isAdmin) {
            if(new Date().getTime() + (1000 * 60 * 5) > new Date(gameDate).getTime()) { // Ensures end date > start date
                throw new ServerError("Game cannot be in the past.");
            }
        }

        // Mark default as not hidden
        const metadata = [{
            is_hidden: false
        }];

        // Make sure teams are not the same
        if(selection1 === selection2) throw new ServerError("Teams cannot be the same.");

        // Wager validation
        if(!isAdmin) {
            // Check if user already has a game live
            // ROLE-CHECK: Publickey + twitter id
            const hasGameLive = await countLiveGamesForUser(creator.publicKey, creator.twitterData?.id);

            if(hasGameLive === null) {
                throw new ServerError("Error checking if user has live game.")
            }

            if(hasGameLive > 2) {
                throw new ServerError("User already has 3 live games.")
            }

            // Check if live game exists with teams and tokens
            const sameGameAmount = await countLiveGames(token, selection1, selection2);

            if(sameGameAmount === null) {
                throw new ServerError("Error checking if live game exists.")
            }

            if(sameGameAmount > 0) {
                throw new ServerError("Live game with same teams and token already exists.")
            }
        }

        // Cannot be more than 1 month in advance
        if(is14DaysAdvance(new Date(), new Date(gameDate))) {
            throw new ServerError("Pool cannot be created more than 14 days in advance.")
        }
        
         // Get assets 
        const assets = await getAssets();
        if(assets.length === 0) throw new ServerError("Unable to get assets.");

        // Get collection by league
        const leagueAssets = assets.find((asset) => asset.league === league);
        if(!leagueAssets) throw new ServerError("Unable to find leagueAssets.");

        // Get team by name
        let team1Image;
        let team2Image;
        if(league === "custom") {
            team1Image = leagueAssets.options[0].imageUrl;
            team2Image = leagueAssets.options[1].imageUrl;
        } else {
            team1Image = leagueAssets.options.find((team) => team.name === selection1)?.imageUrl;
            team2Image = leagueAssets.options.find((team) => team.name === selection2)?.imageUrl;
        }

        if(!team1Image || !team2Image) throw new ServerError("Unable to find team image.");

        // Get NFT images
        const collectionAssets = assets.find((asset) => asset.league === collectionName);
        if(!collectionAssets) throw new ServerError("Unable to find collectionAssets.");

        // Pick random NFT image
        let nft1Image = collectionAssets.options[Math.floor(Math.random() * collectionAssets.options.length)].imageUrl;
        let nft2Image = collectionAssets.options[Math.floor(Math.random() * collectionAssets.options.length)].imageUrl;

        const wagerOptions = {
            title,
            description,
            status: "upcoming",
            league,
            collectionName,
            selections: [
                {
                    title: selection1,
                    record: selection1Record,
                    imageUrl: team1Image,
                    winnerImageUrl: ' ',
                    nftImageUrl: nft1Image
                },
                {
                    title: selection2,
                    record: selection2Record,
                    imageUrl: team2Image,
                    winnerImageUrl: ' ',
                    nftImageUrl: nft2Image
                }
            ],
            startDate: 0,
            endDate: gameDate,
            gameDate,
            metadata,
            creator,
            token,
            isAdmin,
            info: info || ""
        }

        const wager: WagerSchema = await Wager.create(wagerOptions)

        // Create escrow wallet for the wager
        startWagerWalletCreation(wager);

        // Schedule status' NOTE: Max agenda concurrency 20, keep in mind.
        // Schedule for future games
        // TODO: send websocket on live (or client side)
        const oneMinuteFromNow = new Date().getTime() + 60000;
        await AGENDA.schedule(new Date(oneMinuteFromNow), "update status", {
            wagerId: wager._id,
            status: 'live',
            wager
        });

        await Wager.findByIdAndUpdate(wager._id, { startDate: oneMinuteFromNow })
        
        await AGENDA.schedule(new Date(gameDate), "update status", {
            wagerId: wager._id,
            status: 'closed',
            wager
        });

        LOGTAIL.info(`Created wager ${wager._id}`)

        tweetImage(TweetType.GAME_CREATION, wager, "", 0, "", "", creator);
        
        return wager;
    } catch (err) {
        LOGTAIL.error(`Error creating wager ${err}`)
        
        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}