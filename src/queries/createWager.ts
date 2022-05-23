import { AGENDA } from "../config/database";
import { WagerSchema } from "../misc/types";
import createWagerEscrows from "./createWagerEscrows";
import Wager from '../model/wager';
import { ServerError } from "../misc/serverError";

// export function getUTCTime(date: Date): number {
//     return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
//     date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
// }

export default async function createWager(title: string, selection1: string, selection2: string, startDate: string, endDate: string, gameDate: string): Promise<WagerSchema | ServerError> {
    try {
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
            gameDate,
        }

        if(new Date(startDate) < new Date()) {
            wagerOptions.status = "live"
        }

        const wager: WagerSchema = await Wager.create(wagerOptions)

        if(new Date(startDate) < new Date()) {
            // Create escrow wallet for the wager
            const createdEscrows = await createWagerEscrows(wager);
            if(!createdEscrows) {
                throw new ServerError("Error creating wager wallet."); // TODO: DELETE WAGER IF ERR (OR CREATE)
            }
        }

        // Schedule status' NOTE: Max agenda concurrency 20, keep in mind.
        // Schedule for future games
        // TODO: send websocket on live (or client side)
        if(new Date(startDate) > new Date()) {
            await AGENDA.schedule(startDate, "update status", {
                wagerId: wager._id,
                status: 'live',
                wager
            });
        }
        
        await AGENDA.schedule(endDate, "update status", {
            wagerId: wager._id,
            status: 'closed'
        });
        
        return wager;
    } catch (err) {
        console.log(err);
        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}