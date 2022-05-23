import { AGENDA } from "../config/database";
import { WagerSchema } from "../misc/types";
import createWagerEscrows from "./createWagerEscrows";
import Wager from '../model/wager';
import { ServerError } from "../misc/serverError";

export function getUTCTime(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
}

export default async function createWager(title: string, selection1: string, selection2: string, startDate: number, endDate: number, gameDate: number): Promise<WagerSchema | ServerError> {
    try {
        const currentTime = new Date().getTime()

        const wagerOptions = {
            title,
            status: "upcoming",
            selections: [
                {
                    title: selection1
                },
                {
                    title: selection2
                }
            ],
            startDate,
            endDate,
            gameDate
        }

        const wager: WagerSchema = await Wager.create(wagerOptions)

        if(startDate < currentTime) {
            // Create escrow wallet for the wager
            const createdEscrows = await createWagerEscrows(wager);
            if(!createdEscrows) {
                // Delete wager if error
                await Wager.findByIdAndDelete(wager._id);

                throw new ServerError("Error creating wager wallet.");
            }

            await Wager.findByIdAndUpdate(wager._id, { status: 'live' })
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
        }
        
        await AGENDA.schedule(new Date(endDate), "update status", {
            wagerId: wager._id,
            status: 'closed',
            wager
        });
        
        return wager;
    } catch (err) {
        console.log(err);
        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}