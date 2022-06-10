import { ObjectId } from "mongoose";
import { AGENDA } from "../config/database";
import { ServerError } from "../misc/serverError";
import { WagerSchema } from "../misc/types";
import Wager from '../model/wager';
import airdrop, { getAirdropProgress } from "./airdrop";

export async function cancelWager(wagerId: ObjectId): Promise<ServerError | WagerSchema> {
    try {
        const wager: WagerSchema | null = await Wager.findById(wagerId);

        if(!wager) throw new ServerError("Unable to query wager.");

        if(wager.status === "cancelled") throw new ServerError("Wager already cancelled.");

        await Wager.findByIdAndUpdate(wagerId, { status: 'cancelled' });

        await AGENDA.cancel({ wagerId });   

        if(wager.status !== "upcoming") {
            airdrop(wagerId);
        }

        return wager;
    } catch (err) {
        console.log(err);
        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}