import { ObjectId } from "mongodb";
import { LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError";
import Wager from '../model/wager';

export default async function getUserWager(wagerId: ObjectId, publicKey: string) {
    try {
        const wagerData = await Wager.aggregate([
            {
                $match: {
                     _id: wagerId, 
                     placedBets: {
                         $elemMatch: {
                             publicKey
                         }
                     }
                }
            },
            {
                $unwind: '$placedBets',
            },
            {
                $match: { 'placedBets.publicKey': publicKey },
            },
            {
                $replaceRoot: {  newRoot: "$placedBets"  }
            }
        ])

        if(!wagerData) throw new ServerError("Pick not found")

        return wagerData
    } catch (err) {
        LOGTAIL.error(`Error getting user wager ${wagerId} ${publicKey} ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}