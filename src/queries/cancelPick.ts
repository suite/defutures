import { ObjectId } from "mongodb";
import { AGENDA, LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError";
import { PickSchema, WagerSchema } from "../misc/types";
import Pick from '../model/pick';
import airdrop, { getAirdropProgress } from "./airdrop";

export async function cancelPick(pickId: ObjectId): Promise<ServerError | PickSchema> {
    try {
        const pick: PickSchema | null = await Pick.findById(pickId);

        if(!pick) throw new ServerError("Unable to query pick.");

        if(pick.status === "cancelled") throw new ServerError("Wager already cancelled.");

        const cancelledJobs = await AGENDA.cancel({ "data.pickId": pickId });

        if(cancelledJobs === 0) throw new ServerError("Failed to cancel agenda tasks.")
        
        if(pick.status !== "upcoming") {
            LOGTAIL.info(`Starting airdrop back to users for pick ${pickId}`)
            // airdrop(wagerId);
            // TODO: Airdrop
        }

        await Pick.findByIdAndUpdate(pickId, { status: 'cancelled' });

        LOGTAIL.info(`Cancelled pick ${pickId}`)

        return pick;
    } catch (err) {
        LOGTAIL.error(`Error cancelling pick ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
} 