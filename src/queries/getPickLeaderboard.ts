import { ObjectId } from "mongodb";
import Pick from '../model/pick';
import { LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError";

export async function getPickLeaderboard(pickId: ObjectId) {
    try {
        const result = await Pick.aggregate([
            { $match: { _id: pickId } },
            { $unwind: "$placedBets" },
            {
                $lookup: {
                    from: "users",
                    localField: "placedBets.wagerUserId",
                    foreignField: "_id",
                    as: "placedBets.wagerUserDetails"
                }
            },
            { 
                $addFields: {
                    "placedBets.wagerUserDetails": {
                        $ifNull: [{
                            $arrayElemAt: ["$placedBets.wagerUserDetails", 0]
                        }, {}] // Replace with {} if array is empty
                    }
                }
            },
            { $sort: { "placedBets.points": -1, "placedBets.tieBreakerPoints": -1 } },
            {
                $group: {
                    _id: "$_id",
                    placedBets: { $push: "$placedBets" }
                }
            },
            { $project: { placedBets: 1 } }
        ]);

        if (result.length === 0) {
            throw new Error('Pick not found');
        }

        return result[0].placedBets;
    } catch (err) {
        LOGTAIL.error(`Error getting ${pickId} leaderboard ${err}`);
        if (err instanceof ServerError) return err;
    
        return new ServerError("Internal error has occurred.");
    }
}
