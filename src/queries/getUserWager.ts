import { ObjectId } from "mongodb";
import { LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError";
import Wager from '../model/wager';

export default async function getUserWager(wagerId: ObjectId, publicKey: string) {
    try {
        const wagerData = await Wager.findOne({ _id: wagerId, 'placedBets.publicKey': publicKey }, { 'placedBets.$': 1 })
        return wagerData
    } catch (err) {
        LOGTAIL.error(`Error getting user wager ${wagerId} ${publicKey} ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}