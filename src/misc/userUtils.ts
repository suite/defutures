import User from "../model/user";
import { WagerUser } from "./types";

export const getOrCreateUser = async (publicKey: string): Promise<WagerUser> => {
    const defaultUser = {
        publicKey: publicKey
    };

    const user = await User.findOneAndUpdate(
        { publicKey: publicKey },
        { $setOnInsert: defaultUser },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return user;
}

export const addToTotalWins = async (publicKey: string) => {
    await User.updateOne({ publicKey }, { $inc: { 'stats.totalWins': 1 } });
}

export const addToTotalGamesCreated = async (publicKey: string) => {
    await User.updateOne({ publicKey }, { $inc: { 'stats.totalGamesCreated': 1 } });
}

export const addToTotalGamesPlayed = async (publicKey: string) => {
    await User.updateOne({ publicKey }, { $inc: { 'stats.totalGamesPlayed': 1 } });
}

export const addToTotalGamesAirDropped = async (publicKey: string) => {
    await User.updateOne({ publicKey }, { $inc: { 'stats.totalGamesAirDropped': 1 } });
}

export const addToTotalPoints = async (publicKey: string) => {
    await User.updateOne({ publicKey }, { $inc: { 'stats.totalPoints': 1 } });
}

export const updateWinStreak = async (publicKey: string, action: 'add' | 'subtract') => {
    const user = await User.findOne({ publicKey });
    if (!user || !user.stats) return;

    if (action === 'add') {
        user.stats.winStreak += 1;

        // Check and update the longest win streak if needed
        if (user.stats.winStreak > user.stats.longestWinStreak) {
            user.stats.longestWinStreak = user.stats.winStreak;
        }
    } else if (action === 'subtract') {
        if (user.stats.winStreak > 0) {
            user.stats.winStreak = -1;
        } else {
            user.stats.winStreak -= 1;
        }
    }

    await user.save();
}

export const updateHottestPool = async (publicKey: string, numPlayers: number) => {
    const user = await User.findOne({ publicKey });
    if (!user || !user.stats) return;

    if (numPlayers > user.stats.hottestPool) {
        user.stats.hottestPool = numPlayers;
        await user.save();
    }
}

export const updateCraziestUpset = async (publicKey: string, multiplier: number) => {
    const user = await User.findOne({ publicKey });
    if (!user || !user.stats) return;

    if (multiplier > user.stats.craziestUpset) {
        user.stats.craziestUpset = multiplier;
        await user.save();
    }
}