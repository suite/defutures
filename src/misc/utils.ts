import { Keypair, PublicKey } from "@solana/web3.js";
import { ObjectId } from "mongodb";
import Whitelist from "../model/whitelist";
import { PickBetSchema, PickSchema, PickSelectionSchema, PickWalletSchema, WagerSchema, WagerWalletSchema } from "./types";
import WagerWallet from '../model/wagerWallet';
import PickWallet from '../model/pickWallet'
import { getKeypair } from "../queries/solana";
import { ServerError } from "./serverError";
import axios, { Method } from "axios";
import { LOGTAIL, RAPID_API } from "../config/database";
import Pick from '../model/pick';
import Wager from '../model/wager';
import Blacklist from "../model/blacklist";
import Stats from '../model/stats';
import bs58 from "bs58";
import nacl from "tweetnacl";

type PickemTeamWinner = {
    selectionId: ObjectId,
    totalScore: number
}

export function isValidPubKey(pubKey: string): boolean {
    try {
        new PublicKey(pubKey);
        return true;
    } catch(err) {
        return false;
    }
}

export async function isWhitelisted(publicKey: string): Promise<boolean> {
    try {
        if(!isValidPubKey(publicKey)) return false;

        const result = await Whitelist.findOne({ publicKey });
        
        if(result) return true;

        return false;
    } catch(err) {
        return false;
    }
}

export async function getWagerEscrowWallet(selectionId: ObjectId): Promise<Keypair> {
    const wallet: WagerWalletSchema | null = await WagerWallet.findOne({ selectionId });

    if(!wallet) throw new ServerError("Could not find wager wallet.");

    return await getKeypair(wallet.privateKey);    
}

export async function getPickEscrowWallet(pickId: ObjectId): Promise<Keypair> {
    const wallet: PickWalletSchema | null = await PickWallet.findOne({ pickId });

    if(!wallet) throw new ServerError("Could not find pick wallet.");

    return await getKeypair(wallet.privateKey);
}


export function getObjectId(id: string): ObjectId | null {
    try {
        return new ObjectId(id)
    } catch (err) {
        return null;
    }
}

export async function getTeamWinner(selection: PickSelectionSchema): Promise<Array<PickemTeamWinner> | null> {
    try {
        if(!selection.matchId) return null;

        const options = {
            method: 'GET' as Method,
            url: `https://americanfootballapi.p.rapidapi.com/api/american-football/match/${selection.matchId}`,
            headers: {
              'X-RapidAPI-Key': RAPID_API,
              'X-RapidAPI-Host': 'americanfootballapi.p.rapidapi.com'
            }
        };

        const {data}: any = await axios(options);

        if(data['event']['winnerCode'] === null) return null;

        const winnerCode = parseInt(data['event']['winnerCode']);
        const homeScore = parseInt(data['event']['homeScore']['current']);
        const awayScore = parseInt(data['event']['awayScore']['current']);

        const totalScore = homeScore + awayScore;

        // 1, home 
        // 2, away
        // 3, tie

        // api, first is away, second is home

        // Home team won, second team
        if(winnerCode === 1) return [{ 
            selectionId: selection.teams[1]._id,
            totalScore
        }];
        
        // Away team won, first time
        if(winnerCode === 2) return [{ 
            selectionId: selection.teams[0]._id, 
            totalScore
        }];

        const isTie = (homeScore === awayScore && data['event']['status']['type'] === 'finished');

        // Ties, both "win"
        if(isTie) {
            return selection.teams.map(team => (
                { selectionId: team._id, totalScore }
            ));
        }

        return null;
    } catch (err) {
        LOGTAIL.error(`Error finding team winner ${err}`);

        return null;
    }
}

export async function setSelectionTeamWinner(pickId: ObjectId, selection: PickSelectionSchema, teamWinners: Array<PickemTeamWinner>) {
    try {

        for(const teamWinner of teamWinners) {
            LOGTAIL.info(`Setting ${teamWinner.selectionId} as winner`);

            await Pick.updateOne({ "_id": pickId }, {
                'selections.$[outer].teams.$[inner].winner': true,
            }, {
                "arrayFilters": [{ "outer._id": selection._id }, { "inner._id": teamWinner.selectionId }]
            });

            LOGTAIL.info(`Set ${teamWinner.selectionId} as winner`);

            const pickData: PickSchema | null = await Pick.findById(pickId);

            if(pickData === null) {
                throw new ServerError("Could not find placed bets.");
            }

            for(const placedBet of pickData.placedBets) {
                let newPoints = placedBet.points;
                let tieBreakerPoints = 0;
                
                // If the pick is on the winning team, add 100 points
                if(placedBet.pickedTeams.map(team => team.toString()).includes(teamWinner.selectionId.toString())) {
                    newPoints += 1000;
                }

                // If tiebreaker, add tiebreakerpoints
                if(selection.isTiebreaker) {
                    tieBreakerPoints += teamWinner.totalScore - Math.abs(teamWinner.totalScore - placedBet.tieBreaker);
                }

                if(newPoints !== placedBet.points || tieBreakerPoints !== placedBet.tieBreakerPoints) {
                    const updateOpts = {
                        'placedBets.$[outer].points': newPoints,
                        'placedBets.$[outer].tieBreakerPoints': tieBreakerPoints
                    }

                    await Pick.updateOne({ "_id": pickId }, updateOpts, {
                        "arrayFilters": [{ "outer._id": placedBet._id }]
                    });
                }
            }
        }
        
    } catch (err) {
        LOGTAIL.error(`Error setting team winner ${err}`);

        return null;
    }
}

export async function getUpdateSelection(pickId: ObjectId): Promise<PickSelectionSchema | null> {
    try {
        const pick: PickSchema | null = await Pick.findById(pickId);

        if(pick === null) return null;

        for(const selection of pick.selections) {
            if(!selection.teams.map(team => team.winner).includes(true)) {
                return selection;
            }
        }

        return null;
    } catch(err) {
        LOGTAIL.error(`Error finding update selection ${err}`);

        return null;
    }
}

const getStats = async (live=false) => {
    let wagerQuery = {};
    let pickQuery = {};

    if (live) {
        wagerQuery = { 'status': { $nin: ['cancelled', 'completed'] } };
        pickQuery = { 'status': { $nin: ['cancelled', 'completed'] } };
    }

    const wagers: Array<WagerSchema> = await Wager.find(wagerQuery);
    const picks: Array<PickSchema> = await Pick.find(pickQuery);

    let totalGames = wagers.length + picks.length;
    let totalPicks = 0;
    let users = new Set();

    const volumes: any = {};

    wagers.forEach(wager => {
        const token = wager.token || 'DUST';
        if(!volumes[token]) volumes[token] = 0;

        volumes[token] += wager.selections[0].totalSpent;
        volumes[token] += wager.selections[1].totalSpent;

        totalPicks += wager.placedBets.length;

        wager.placedBets.forEach(placedBet => {
            users.add(placedBet.publicKey);
        })
    });

    picks.forEach(pick => {
        volumes['DUST'] += pick.totalSpent;

        totalPicks += pick.placedBets.length;

        pick.placedBets.forEach(placedBet => {
            users.add(placedBet.publicKey);
        });
    });

    const volArr = Object.entries(volumes).map(([token_name, amount]) => ({
        token: token_name,
        amount: amount
    }));

    return {
        gamesHosted: totalGames,
        uniquePlayers: users.size,
        totalPicks: totalPicks,
        totalVolume: volArr
    }
}

export async function updateStats(): Promise<boolean> {
    try {
         // Fetch live and total stats concurrently
        const [allTime, live] = await Promise.all([getStats(false), getStats(true)]);

        // Check if a stats record already exists
        const existingStats = await Stats.findOne();

        const updateData = {
            live: live,
            total: allTime,
        };

        if (!existingStats) {
            // If no stats record exists, create a new one
            await Stats.create(updateData);
        } else {
            // If a record exists, update it
            await Stats.updateOne({}, updateData);
        }

        return true;
    } catch (err) {
        LOGTAIL.error(`Error updating stats ${err}`);

        return false;
    }
}

export function confirmWalletSigned(nonce: string, signedMessage: string, publicKey: string): boolean {
    try {
        const nonceUint8 = new TextEncoder().encode(nonce);
        const signatureUint8 = Uint8Array.from(Buffer.from(signedMessage, 'hex'));
        const pubKeyUint8 = bs58.decode(publicKey);

        const verified = nacl.sign.detached.verify(nonceUint8, signatureUint8, pubKeyUint8);

        return verified;
    } catch(err) {
        return false;
    }
}

export const is14DaysAdvance = (startDate: Date, endDate: Date): boolean => {
    const oneMonthFromStart = new Date(startDate.getTime());
  
    oneMonthFromStart.setDate(startDate.getDate() + 14);
  
    return endDate.getTime() >= oneMonthFromStart.getTime();
}

export const countLiveGames = async (token: string, selection1Title: string, selection2Title: string): Promise<number | null> => {
    try {
      const count = await Wager.countDocuments({
        $and: [
          { status: { $in: ['live', 'upcoming'] } },
          { token: token },
          {
            $and: [
              { selections: { $elemMatch: { title: selection1Title } } },
              { selections: { $elemMatch: { title: selection2Title } } },
            ]
          },
        ],
      });
  
      return count;
    } catch (error) {
      return null;
    }
};

export const countLiveGamesForUser = async (publicKey?: string, twitterId?: string): Promise<number | null> => {
    try {
        const orConditions: any[] = [];

        if (publicKey) {
            orConditions.push({ 'creator.publicKey': publicKey });
        }

        if (twitterId) {
            orConditions.push({ 'creator.twitterData.id': twitterId });
        }

        if(orConditions.length === 0) return null;

        const count = await Wager.countDocuments({
            $or: orConditions,
            status: { $in: ['live', 'upcoming'] },
        });

        return count;
    } catch (error) {
        return null;
    }
}

export const countAllLiveOrUpcomingGames = async (): Promise<number | null> => {
    try {
      const count = await Wager.countDocuments({
        status: { $in: ['live', 'upcoming'] },
      });

      return count;
    } catch (error) {
      return null;
    }
};

export const isUserBlacklisted = async (publicKey?: string, twitterId?: string): Promise<boolean | null> => {
    let query: any[] = [];

    if (publicKey) {
        query.push({ publicKey: publicKey });
    }

    if (twitterId) {
        query.push({ twitterId: twitterId });
    }

    try {
        if (query.length === 0) {
            return null;
        }

        const result = await Blacklist.findOne({ $or: query });

        return Boolean(result);
    } catch (error) {
        return null;
    }
};
