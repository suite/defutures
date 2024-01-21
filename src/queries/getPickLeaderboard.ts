import { ObjectId } from "mongodb";
import Pick from '../model/pick';
import { LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError";

export async function getPickLeaderboard(pickId: ObjectId) {
    try {
        const result = await Pick.aggregate([
            // Match the specific pick
            { $match: { _id: pickId } },
            // Unwind the placedBets array to process each bet individually
            { $unwind: "$placedBets" },
            // Sort by points and then by tieBreakerPoints in descending order
            { $sort: { "placedBets.points": -1, "placedBets.tieBreakerPoints": -1 } },
            // Group back the bets into a single document
            { $group: { _id: "$_id", placedBets: { $push: "$placedBets" } } },
            // Optionally, project fields if needed
            { $project: { placedBets: 1 } }
        ]);

        // The result is an array of documents, but we expect only one document
        // corresponding to the pickId
        if (result.length === 0) {
            throw new Error('Pick not found');
        }

        return result[0].placedBets;
    } catch (err) {
        LOGTAIL.error(`Error getting ${pickId} leaderboard ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}
