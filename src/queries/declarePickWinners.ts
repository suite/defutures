import { ObjectId } from "mongodb";
import { LOGTAIL } from "../config/database";
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

            await Pick.updateOne({ 'selections.teams._id': pick.pickTeamId }, { 
                'selections.teams.$.finalScore': pick.finalScore,
                'selections.teams.$.winner': pick.winner,
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

        for(const placedBet of pickData.placedBets) {
            let points = 0;
            for(const pickedTeam of placedBet.pickedTeams) {
                const pickedTeamData = teamData[JSON.stringify(pickedTeam)]

                if(pickedTeamData.winner) points = points + 1;

                if(pickedTeamData.totalScore) {
                    const tieBreakerPoints = pickedTeamData.totalScore - (Math.abs(pickedTeamData.totalScore - placedBet.tieBreaker))
                    points = points + tieBreakerPoints;
                }
            }

            await Pick.findOneAndUpdate(placedBet._id, {
                points
            });
        }

        await Pick.findByIdAndUpdate(pickId, { 'status': 'completed' })

        LOGTAIL.info(`Delcared winners for pick ${pickId}`)

        return true;
    } catch (err) {
        LOGTAIL.error(`Error declaring ${pickId} winners ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}