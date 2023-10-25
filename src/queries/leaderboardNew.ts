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
        const mostWinsUser = await User.findOne().sort({ 'stats.totalWins': -1 }).limit(1);
        const mostGamesPlayedUser = await User.findOne().sort({ 'stats.totalGamesPlayed': -1 }).limit(1);
        const highestWinStreakUser = await User.findOne().sort({ 'stats.winStreak': -1 }).limit(1);
        const mostCreationsUser = await User.findOne().sort({ 'stats.totalGamesCreated': -1 }).limit(1);
   
        const users = await User.find({}).sort({ 'stats.totalPoints': -1 });

        const leaderboard = {
            mostWins: mostWinsUser,
            mostGamesPlayed: mostGamesPlayedUser,
            highestWinStreak: highestWinStreakUser,
            mostCreations: mostCreationsUser,
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
        // Identify the user with the most wins
        const mostWinsUser = await User.findOne().sort({ 'stats.totalWins': -1 }).limit(1);
        if (mostWinsUser) {
            await addToTotalPoints(mostWinsUser.publicKey);
        }

        // Identify the user with the most games played
        const mostGamesPlayedUser = await User.findOne().sort({ 'stats.totalGamesPlayed': -1 }).limit(1);
        if (mostGamesPlayedUser) {
            await addToTotalPoints(mostGamesPlayedUser.publicKey);
        }

        // Identify the user with the highest current win streak
        const highestWinStreakUser = await User.findOne().sort({ 'stats.winStreak': -1 }).limit(1);
        if (highestWinStreakUser) {
            await addToTotalPoints(highestWinStreakUser.publicKey);
        }

        // Identify the user with the most game creations
        const mostCreationsUser = await User.findOne().sort({ 'stats.totalGamesCreated': -1 }).limit(1);
        if (mostCreationsUser) {
            await addToTotalPoints(mostCreationsUser.publicKey);
        }

    } catch (err) {
        LOGTAIL.error(`Error updating daily points ${err}`)
    }
}
