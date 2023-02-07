import { ObjectId } from "mongodb";
import { LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError";
import { WagerBetSchema, WagerSchema, WagerUser } from "../misc/types";
import Wager from '../model/wager';
import User from '../model/user';

export async function getActivity(wagerId: ObjectId): Promise<ServerError | Array<WagerBetSchema>> {
    try {
        const wager: WagerSchema | null = await Wager.findById(wagerId);

        if(!wager) throw new ServerError("Unable to query wager.");

        // Load twitter data from User
        const users = await User.find({});
        const userData: { [publicKey: string]: WagerUser } = {};

        // For each user, add their public key as a key to userData 
        for (const user of users) {
            userData[user.publicKey] = user;
        }

        // Add user data to each placedBet
        wager.placedBets.forEach((bet: WagerBetSchema) => {
            bet.user = userData[bet.publicKey];
        });

        return wager.placedBets;
    } catch (err) {
        LOGTAIL.error(`Error getting activity for wagerId ${wagerId} ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}