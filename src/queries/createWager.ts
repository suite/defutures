import { AGENDA } from "../config/database";
import { WagerSchema } from "../misc/types";
import createWagerEscrows from "./createWagerEscrows";
import Wager from '../model/wager';
import { ServerError } from "../misc/serverError";

export function getUTCTime(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
}

export default async function createWager(title: string, selection1: string, selection2: string, startDate: Date, endDate: Date, gameDate: Date): Promise<WagerSchema | ServerError> {
    try {
        const startDateUTC = getUTCTime(startDate);
        const currentTime = getUTCTime(new Date())

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

        if(startDateUTC < currentTime) {
            wagerOptions.status = "live"
        }

        const wager: WagerSchema = await Wager.create(wagerOptions)

        if(startDateUTC < currentTime) {
            // Create escrow wallet for the wager
            const createdEscrows = await createWagerEscrows(wager);
            if(!createdEscrows) {
                throw new ServerError("Error creating wager wallet."); // TODO: DELETE WAGER IF ERR (OR CREATE)
            }
        }

        // Schedule status' NOTE: Max agenda concurrency 20, keep in mind.
        // Schedule for future games
        // TODO: send websocket on live (or client side)
        if(startDateUTC > currentTime) {
            await AGENDA.schedule(startDate.toUTCString(), "update status", {
                wagerId: wager._id,
                status: 'live',
                wager
            });
        }
        
        await AGENDA.schedule(endDate.toUTCString(), "update status", {
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