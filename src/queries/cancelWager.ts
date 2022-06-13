import { ObjectId } from "mongodb";
import { AGENDA } from "../config/database";
import { ServerError } from "../misc/serverError";
import { WagerSchema } from "../misc/types";
import Wager from '../model/wager';
import airdrop, { getAirdropProgress } from "./airdrop";
import * as mongodb from 'mongodb';

export async function cancelWager(wagerId: ObjectId): Promise<ServerError | WagerSchema> {
    try {
        console.log("Wager id: ", wagerId)
        console.log("Wager id: ", typeof(wagerId))

        const wager: WagerSchema | null = await Wager.findById(wagerId);

        if(!wager) throw new ServerError("Unable to query wager.");

        if(wager.status === "cancelled") throw new ServerError("Wager already cancelled.");

        const cancelledJobs = await AGENDA.cancel({ "data.wagerId": wagerId });

        if(cancelledJobs === 0) throw new ServerError("Failed to cancel agenda tasks.")
        
        if(wager.status !== "upcoming") {
            airdrop(wagerId);
        }

        await Wager.findByIdAndUpdate(wagerId, { status: 'cancelled' });

        return wager;
    } catch (err) {
        console.log(err);
        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
} 