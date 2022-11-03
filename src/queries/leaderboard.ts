import { ObjectId } from "mongodb";
import Pick from '../model/pick';
import { LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError";
import { PickBetSchema, PickSchema } from "../misc/types";

type SeasonLeaderboard = {
    [key: string]: {
        points: number;
        gamesPlayed: number;
    };
}

export async function getPickemLeaderboard(pickId?: ObjectId | null): Promise<ServerError | Array<PickBetSchema> | SeasonLeaderboard> {
    // pickem:
    // particular week 
    //  scorecard, tiebreaker
    // full season
    //  scorecard, accuracy
    

    try {
        if(pickId !== null) {
            const pick: PickSchema | null = await Pick.findById(pickId);

            if(!pick) throw new ServerError("Unable to query pick.");

            // sort placedBets in pick by point descending order
            pick.placedBets.sort((a, b) => b.points - a.points);

            return pick.placedBets;
        }

        const picks: Array<PickSchema> = await Pick.find({ status: 'completed' });

        // combine placedBets from all picks
        const placedBets: Array<PickBetSchema> = [];
        for(const pick of picks) {
            placedBets.push(...pick.placedBets);
        }

        // total points for each publicKey + number of games played by user
        const leaderboard: SeasonLeaderboard = {};
        for(const placedBet of placedBets) {
            if(leaderboard[placedBet.publicKey]) {
                leaderboard[placedBet.publicKey].points = leaderboard[placedBet.publicKey].points + placedBet.points;
                leaderboard[placedBet.publicKey].gamesPlayed = leaderboard[placedBet.publicKey].gamesPlayed + 1;
            } else {
                leaderboard[placedBet.publicKey] = {
                    points: placedBet.points,
                    gamesPlayed: 1
                }
            }
        }
        

        return leaderboard;
    } catch (err) {
        LOGTAIL.error(`Error getting leaderboard ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    } 
}