import { ObjectId } from "mongodb";
import Pick from '../model/pick';
import { LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError";
import { PickSchema } from "../misc/types";

export async function getPickemLeaderboard(pickId?: ObjectId): Promise<ServerError | PickSchema> {
    // pickem:
    // particular week 
    //  scorecard, tiebreaker
    // full season
    //  scorecard, accuracy
    

    try {
         // 
        if(pickId) {
            const pick: PickSchema | null = await Pick.findById(pickId);

            if(!pick) throw new ServerError("Unable to query pick.");

            // check if completed

            // sort by points- TODO: fix winner calc

            /*

            [
                {
                    rank:
                    pubKey:
                    scoreCard:
                    Tiebreaker:
                    points
                }
            ]



            */

        }

        return new ServerError("Internal error has occured.");
    } catch (err) {
        LOGTAIL.error(`Error getting leaderboard ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    } 
}