import { ObjectId } from "mongodb";
import Pick from '../model/pick';
import { LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError";
import { PickBetSchema, PickSchema } from "../misc/types";

type SeasonLeaderboard = {
    [key: string]: {
        points: number;
        gamesPlayed: number;
        totalSelections: number;
        tieBreakerPoints: number;
    };
}

type PickemLeaderboard = {
    publicKey: string;
    points: number;
    tieBreaker: number;
    tieBreakerPoints: number;
    gamesPlayed?: number;
    totalSelections : number;
    accuracy: number;
}

export async function getPickemLeaderboard(pickId?: ObjectId | null): Promise<ServerError | Array<PickemLeaderboard> | SeasonLeaderboard> {
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

            // sort placedBets in pick with same points by tieBreakerPoints descending order
            pick.placedBets.sort((a, b) => {
                if(a.points === b.points) {
                    return b.tieBreakerPoints - a.tieBreakerPoints;
                }
                return 0;
            });

            // remove tieBreaker from all placedBets if pick is live
            if(pick.status === "live") {
                for(const placedBet of pick.placedBets) {
                    placedBet.tieBreaker = -1;
                }
            }

            // return only publicKey, points, and tieBreaker from placedBets
            const leaderboard: Array<PickemLeaderboard> = pick.placedBets.map((placedBet) => {
                const { publicKey, points, tieBreaker, tieBreakerPoints } = placedBet;
                const totalSelections = placedBet.pickedTeams.length;
                const accuracy = Math.floor((points/(totalSelections*1000)) * 10000) / 100;

                return {
                    publicKey,
                    points,
                    tieBreaker,
                    tieBreakerPoints,
                    totalSelections,
                    accuracy
                }
            })

            return leaderboard;
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
                leaderboard[placedBet.publicKey].totalSelections = leaderboard[placedBet.publicKey].totalSelections + placedBet.pickedTeams.length;
                leaderboard[placedBet.publicKey].tieBreakerPoints = leaderboard[placedBet.publicKey].tieBreakerPoints + placedBet.tieBreakerPoints;
            } else {
                leaderboard[placedBet.publicKey] = {
                    points: placedBet.points,
                    tieBreakerPoints: placedBet.tieBreakerPoints,
                    gamesPlayed: 1,
                    totalSelections: placedBet.pickedTeams.length
                }
            }
        }

        // sort leaderboard by points descending order
        const leaderboardArray: Array<PickemLeaderboard> = Object.keys(leaderboard).map((publicKey) => {
            const { points, gamesPlayed, totalSelections, tieBreakerPoints } = leaderboard[publicKey];
            const accuracy = Math.floor((points/(totalSelections*1000)) * 10000) / 100;
            
            return {
                publicKey,
                points,
                tieBreaker: -1,
                tieBreakerPoints,
                gamesPlayed,
                totalSelections,
                accuracy
            }
        }).sort((a, b) => b.points - a.points);

        // sort leaderboardArray with same points by tieBreakerPoints descending order
        leaderboardArray.sort((a, b) => {
            if(a.points === b.points) {
                return b.tieBreakerPoints - a.tieBreakerPoints;
            }
            return 0;
        });
        

        return leaderboardArray;
    } catch (err) {
        LOGTAIL.error(`Error getting leaderboard ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    } 
}