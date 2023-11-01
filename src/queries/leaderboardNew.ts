import { LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError";
import { addToTotalPoints } from "../misc/userUtils";
import User from "../model/user";

/*
(1) point per day in a top spot
(1) point per game played
(1) point per win
(1) point per pool airdropped
*/


/*
Most wins
Most games played
Win streak
Most creations
*/

// 

export async function getLeaderboard(): Promise<ServerError | any> {
    try {
        const queries = [
            User.findOne().sort({ 'stats.totalWins': -1 }).limit(1),
            User.findOne().sort({ 'stats.totalGamesPlayed': -1 }).limit(1),
            User.findOne().sort({ 'stats.winStreak': -1 }).limit(1),
            User.findOne().sort({ 'stats.totalGamesCreated': -1 }).limit(1),
            User.findOne().sort({ 'stats.hottestPool': -1 }).limit(1),
            User.findOne().sort({ 'stats.craziestUpset': -1 }).limit(1),
            User.find({}).sort({ 'stats.totalPoints': -1 })
        ];

        const [
            mostWinsUser,
            mostGamesPlayedUser,
            highestWinStreakUser,
            mostCreationsUser,
            hottestPool,
            craziestUpset,
            users
        ] = await Promise.all(queries);

        const leaderboard = {
            mostWins: mostWinsUser,
            mostGamesPlayed: mostGamesPlayedUser,
            highestWinStreak: highestWinStreakUser,
            mostCreations: mostCreationsUser,
            hottestPool: hottestPool,
            craziestUpset: craziestUpset,
            users
        }

        return leaderboard;
    } catch (err) {
        LOGTAIL.error(`Error getting leaderboard ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}


export async function dailyPointUpdate() {
    try {
        const queries = [
            User.findOne().sort({ 'stats.totalWins': -1 }).limit(1),
            User.findOne().sort({ 'stats.totalGamesPlayed': -1 }).limit(1),
            User.findOne().sort({ 'stats.winStreak': -1 }).limit(1),
            User.findOne().sort({ 'stats.totalGamesCreated': -1 }).limit(1),
            User.findOne().sort({ 'stats.hottestPool': -1 }).limit(1),
            User.findOne().sort({ 'stats.craziestUpset': -1 }).limit(1)
        ];

        const [
            mostWinsUser,
            mostGamesPlayedUser,
            highestWinStreakUser,
            mostCreationsUser,
            hottestPool,
            craziestUpset
        ] = await Promise.all(queries);

        const updatePointsPromises = [
            mostWinsUser ? addToTotalPoints(mostWinsUser.publicKey) : null,
            mostGamesPlayedUser ? addToTotalPoints(mostGamesPlayedUser.publicKey) : null,
            highestWinStreakUser ? addToTotalPoints(highestWinStreakUser.publicKey) : null,
            mostCreationsUser ? addToTotalPoints(mostCreationsUser.publicKey) : null,
            hottestPool ? addToTotalPoints(hottestPool.publicKey) : null,
            craziestUpset ? addToTotalPoints(craziestUpset.publicKey) : null,
        ].filter(Boolean);  // Remove any null values from the array

        await Promise.all(updatePointsPromises);
    } catch (err) {
        LOGTAIL.error(`Error updating daily points ${err}`)
    }
}
