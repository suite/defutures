import { ObjectId } from "mongodb";
import { LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError";
import Pick from '../model/pick';

export default async function getUserPick(pickId: ObjectId, publicKey: string) {
    try {
        const pickData = await Pick.aggregate([
            {
                $match: {
                     _id: pickId, 
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

        if(!pickData) throw new ServerError("Pick not found")

        return pickData
    } catch (err) {
        LOGTAIL.error(`Error getting user pick ${pickId} ${publicKey} ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}