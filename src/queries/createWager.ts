import { AGENDA, LIVE_GAME_CAP, LOGTAIL } from "../config/database";
import { WagerSchema, WagerUser } from "../misc/types";
import createWagerEscrows from "./createWagerEscrows";
import Wager from '../model/wager';
import { ServerError } from "../misc/serverError";
import User from "../model/user";
import { countAllLiveOrUpcomingGames, countLiveGames, countLiveGamesForUser, isOneMonthAdvance, isUserBlacklisted } from "../misc/utils";
import getAssets from "./getAssets";

export function getUTCTime(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
}

export default async function createWager(title: string,
    description: string, // fine
    league: string, // set collection name
    collectionName: string,
    selection1: string, 
    selection1Record: string,
    selection2: string, 
    selection2Record: string,
    startDate: number, 
    endDate: number, gameDate: number, creator: WagerUser, token: string): Promise<WagerSchema | ServerError> {

    try {
        // Check if user is blacklisted
        const isBlacklisted = await isUserBlacklisted(creator.publicKey, creator.twitterData?.id);
       
        if(isBlacklisted === null) throw new ServerError("Unable to check if user is blacklisted.");
        if(isBlacklisted) throw new ServerError("User is blacklisted.");

        // Check game cap
        const liveGameCount = await countAllLiveOrUpcomingGames();

        if(liveGameCount === null) throw new ServerError("Unable to get live game count.");
        if(liveGameCount >= LIVE_GAME_CAP) throw new ServerError("Game cap reached.");

        // Date check
        if(new Date(startDate) > new Date(endDate)) { // Ensures end date > start date
            throw new ServerError("Game cannot be in the past.");
        }

        // Check if admin game
        const isAdmin = creator.roles.includes("ADMIN");

        // Mark default as not hidden
        const metadata = [{
            is_hidden: false
        }];

        // Make sure teams are not the same
        if(selection1 === selection2) throw new ServerError("Teams cannot be the same.");

        // Wager validation
        if(!isAdmin) {
            // Check if user already has a game live
            const hasGameLive = await countLiveGamesForUser(creator.publicKey);

            if(hasGameLive === null) {
                throw new ServerError("Error checking if user has live game.")
            }

            if(hasGameLive > 0) {
                throw new ServerError("User already has a live game.")
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
        if(isOneMonthAdvance(new Date(), new Date(endDate))) {
            throw new ServerError("Game cannot be more than 1 month in advance.")
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

        const currentTime = new Date().getTime()

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
            startDate,
            endDate,
            gameDate,
            metadata,
            creator,
            token,
            isAdmin
        }

        const wager: WagerSchema = await Wager.create(wagerOptions)

        // Create escrow wallet for the wager
        const createdEscrows = await createWagerEscrows(wager);
        if(!createdEscrows) {
            // Delete wager if error
            await Wager.findByIdAndDelete(wager._id);

            throw new ServerError("Error creating wager wallet.");
        }

        // Schedule status' NOTE: Max agenda concurrency 20, keep in mind.
        // Schedule for future games
        // TODO: send websocket on live (or client side)
        if(startDate > currentTime) {
            await AGENDA.schedule(new Date(startDate), "update status", {
                wagerId: wager._id,
                status: 'live',
                wager
            });
        } else {
            await Wager.findByIdAndUpdate(wager._id, { status: 'live' })
        }
        
        await AGENDA.schedule(new Date(endDate), "update status", {
            wagerId: wager._id,
            status: 'closed',
            wager
        });

        LOGTAIL.info(`Created wager ${wager._id}`)
        
        return wager;
    } catch (err) {
        LOGTAIL.error(`Error creating wager ${err}`)
        
        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}