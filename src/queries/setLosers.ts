import { ObjectId } from "mongodb"
import { LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError"
import Wager from '../model/wager';

export default async function setLosers(losingSelection: ObjectId) {
    try {
        const userBets = await Wager.aggregate([
            {
                $match: {
                    placedBets: {
                        $elemMatch: {
                            selectionId: losingSelection
                        }
                    }
                }
            },
            {
                $unwind: '$placedBets'
            },
            {
                $match: { 'placedBets.selectionId': losingSelection },
            },
            {
                $replaceRoot: {  newRoot: "$placedBets"  }
            }
        ])

        for(const placedBet of userBets) {
            const placedBetsFilter = {
                placedBets: {
                    $elemMatch: {
                        selectionId: placedBet.selectionId,
                        publicKey: placedBet.publicKey
                    }
                }
            }

            await Wager.updateOne(placedBetsFilter, { 'placedBets.$.winAmount': -1 });
        }
    } catch (err) {
        LOGTAIL.error(`Error setting winners ${err}`)
        throw new ServerError("Error setting winners.")
    }
}