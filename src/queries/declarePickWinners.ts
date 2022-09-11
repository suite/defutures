import { ObjectId } from "mongodb";
import { LOGTAIL, PAYOUT_PRECISION, PICKEM_FEE_MULTIPLIER } from "../config/database";
import { ServerError } from "../misc/serverError";
import { PickSchema, PickTeam } from "../misc/types";
import Pick from '../model/pick';

type PickStatus = {
    selectionId: ObjectId,
    pickTeamId: ObjectId,
    finalScore: number,
    winner: boolean
}

export default async function declarePickWinners(pickId: ObjectId, picks: Array<PickStatus>): Promise<boolean | ServerError> {
    try {   
        // Winner already selected or wager still live/upcoming 
        const otherWinners = await Pick.findOne({ _id: pickId, $or: [{'status': 'completed'}, {'status': { $ne: 'closed' }}] })
        if(otherWinners) throw new ServerError("Unable to declare winner. Either winner already selected or game is not closed.");

        // Update winning teams
        for(const pick of picks) {
            await Pick.updateOne({ 'selections._id': pick.selectionId }, { 
                $inc: { 'selections.$.totalScore': pick.finalScore }
            })

            console.log(`on pick ${pick.selectionId}`)

            await Pick.updateOne({ "_id": pickId }, { 
                'selections.$[outer].teams.$[inner].finalScore': pick.finalScore,
                'selections.$[outer].teams.$[inner].winner': pick.winner,
            }, {
                "arrayFilters": [{ "outer._id": pick.selectionId }, { "inner._id": pick.pickTeamId }]
            })
        }

        const pickData: PickSchema | null = await Pick.findById(pickId)

        if(!pickData) throw new ServerError("Could not find pick when declaring winners")

        const teamData: { [key: string]: PickTeam } = {};

        for(const selection of pickData.selections) {
            for(const team of selection.teams) {
                teamData[JSON.stringify(team._id)] = team;

                if(selection.isTiebreaker) {
                    teamData[JSON.stringify(team._id)].totalScore = selection.totalScore;
                }
            }
        }

        // Set points
        for(const placedBet of pickData.placedBets) {
            let points = 0;
            for(const pickedTeam of placedBet.pickedTeams) {
                const pickedTeamData = teamData[JSON.stringify(pickedTeam)]

                if(pickedTeamData.winner) points = points + 1000; // weight winner points more

                if(pickedTeamData.totalScore) {
                    const tieBreakerPoints = pickedTeamData.totalScore - (Math.abs(pickedTeamData.totalScore - placedBet.tieBreaker))
                    // points = points + tieBreakerPoints;
                }
            }

            await Pick.updateOne({ 'placedBets._id': placedBet._id }, {
                'placedBets.$.points': points
            });
        }

        // TODO: Test multiple games
        // Update win amounts (get win amount) -> send to fee wallet
        const topPoints = await Pick.aggregate([
            { 
                $match: { _id: pickId }
            },
            { "$addFields": {
              "sortPoints": { "$max": "$placedBets.points" }
            }},
            { "$sort": { "sortPoints": -1 }}
        ]);

        if(!topPoints || topPoints.length === 0 || !(topPoints[0].sortPoints)) {
            throw new ServerError("Could not find highest score")
        }

        const highestScore = topPoints[0].sortPoints;

        // set winAmount split between length of winningBets
        const winningBets = await Pick.find({ "_id": pickId, "placedBets.points": highestScore }, { "placedBets.$": 1 });
        
        let winAmount = (pickData.totalSpent / winningBets.length) * PICKEM_FEE_MULTIPLIER;
        winAmount = Math.floor(winAmount * PAYOUT_PRECISION) / PAYOUT_PRECISION;

        // TODO: scuffed

        for(const winningBet of winningBets) {
            const placedBetId = winningBet.placedBets[0]._id;
            await Pick.updateOne({ 'placedBets._id': placedBetId }, {
                'placedBets.$.winAmount': winAmount
            });
        }

        await Pick.findByIdAndUpdate(pickId, { 'status': 'completed' })

        LOGTAIL.info(`Delcared winners for pick ${pickId}`)

        return true;
    } catch (err) {
        console.log(err)
        LOGTAIL.error(`Error declaring ${pickId} winners ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}