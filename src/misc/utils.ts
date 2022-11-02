import { Keypair, PublicKey } from "@solana/web3.js";
import { ObjectId } from "mongodb";
import Whitelist from "../model/whitelist";
import { PickBetSchema, PickSchema, PickSelectionSchema, PickWalletSchema, WagerWalletSchema } from "./types";
import WagerWallet from '../model/wagerWallet';
import PickWallet from '../model/pickWallet'
import { getKeypair } from "../queries/solana";
import { ServerError } from "./serverError";
import axios, { Method } from "axios";
import { LOGTAIL, RAPID_API } from "../config/database";
import Pick from '../model/pick';

type PickemTeamWinner = {
    selectionId: ObjectId,
    score: number
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

        // 1, home 
        // 2, away
        // 3, tie

        // api, first is away, second is home

        // Home team won, second team
        if(winnerCode === 1) return [{ 
            selectionId: selection.teams[1]._id,
            score: homeScore
        }];
        
        // Away team won, first time
        if(winnerCode === 2) return [{ 
            selectionId: selection.teams[0]._id, 
            score: awayScore
        }];

        // Ties, both "win"
        if(winnerCode === 3) {
            return selection.teams.map(team => (
                { selectionId: team._id, score: homeScore }
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

            const pickData: PickSchema | null = await Pick.findById(pickId, { "placedBets.$": 1 });

            if(pickData === null) {
                throw new ServerError("Could not find placed bets.");
            }

            for(const placedBet of pickData.placedBets) {
                if(placedBet.pickedTeams.map(team => team.toString()).includes(teamWinner.selectionId.toString())) {
                    const currentScore = placedBet.points;
                    let newScore = currentScore + 10000;

                    if(selection.isTiebreaker) {
                        const tieBreakerPoints = teamWinner.score - Math.abs(teamWinner.score - placedBet.tieBreaker);
                        newScore += tieBreakerPoints;
                    }

                    await Pick.updateOne({ "_id": pickId }, {
                        'placedBets.$[outer].points': newScore
                    }, {
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