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
                    status: { $first: "$status" }, // Include the status of the pick
                    placedBets: { $push: "$placedBets" },
                }
            },
            {
                $project: {
                    status: 1, // Ensure status is included in the final projection
                    placedBets: 1
                }
            }
        ]);

        if (result.length === 0) {
            throw new Error('Pick not found');
        }

        if(result[0].status === "live") {
            const hiddenTiebreaker = result[0].placedBets.map((bet: any) => {
                const { tieBreaker, ...rest } = bet; 
                return rest; 
            });

            return hiddenTiebreaker;
        }

        return result[0].placedBets;
    } catch (err) {
        LOGTAIL.error(`Error getting ${pickId} leaderboard ${err}`);
        if (err instanceof ServerError) return err;
    
        return new ServerError("Internal error has occurred.");
    }
}
