import { AGENDA, LOGTAIL } from "../config/database";
import { WagerSchema } from "../misc/types";
import createWagerEscrows from "./createWagerEscrows";
import Wager from '../model/wager';
import { ServerError } from "../misc/serverError";

export function getUTCTime(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
}

export default async function createWager(title: string,
    description: string,
    league: string,
    selection1: string, 
    selection1Record: string,
    selection1img: string, 
    selection1winnerImg: string,
    selection1nftImg: string,
    selection2: string, 
    selection2Record: string,
    selection2img: string, 
    selection2winnerImg: string, 
    selection2nftImg: string,
    startDate: number, 
    endDate: number, gameDate: number, metadata?: Array<any>): Promise<WagerSchema | ServerError> {

    try {
        const currentTime = new Date().getTime()

        const wagerOptions = {
            title,
            description,
            status: "upcoming",
            league,
            selections: [
                {
                    title: selection1,
                    record: selection1Record,
                    imageUrl: selection1img,
                    winnerImageUrl: selection1winnerImg,
                    nftImageUrl: selection1nftImg
                },
                {
                    title: selection2,
                    record: selection2Record,
                    imageUrl: selection2img,
                    winnerImageUrl: selection2winnerImg,
                    nftImageUrl: selection2nftImg
                }
            ],
            startDate,
            endDate,
            gameDate,
            metadata
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