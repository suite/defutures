import { ObjectId } from "mongodb";
import { LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError";
import { WagerBetSchema, WagerSchema } from "../misc/types";
import Wager from '../model/wager';



export async function getActivity(wagerId: ObjectId): Promise<ServerError | Array<WagerBetSchema>> {
    try {
        const wager: WagerSchema | null = await Wager.findById(wagerId);

        if(!wager) throw new ServerError("Unable to query wager.");

        return wager.placedBets;
    } catch (err) {
        LOGTAIL.error(`Error getting activity for wagerId ${wagerId} ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}