import { ObjectId } from "mongodb";
import Pick from '../model/pick';
import { PickSchema } from "../misc/types";
import { ServerError } from "../misc/serverError";
import { LOGTAIL } from "../config/database";

export default async function updatePick(
    pickId: ObjectId, 
    winningSelectionIds: Array<ObjectId>, 
    tiebreaker?: number
): Promise<boolean | ServerError> {
    try {
        const pick: PickSchema | null = await Pick.findById(pickId);

        if (!pick) {
            throw new Error('Pick not found');
        }

        // Update the "winner" field for winning teams
        pick.selections.forEach(selection => {
            selection.teams.forEach(team => {
                if (winningSelectionIds.includes(team._id)) {
                    team.winner = true;
                }
            });
        });

        // Update points and tieBreakerPoints for placed bets
        pick.placedBets.forEach(bet => {
            bet.points += bet.pickedTeams.filter(teamId => winningSelectionIds.includes(teamId)).length;

            if (typeof tiebreaker !== 'undefined') {
                bet.tieBreakerPoints = tiebreaker - Math.abs(bet.tieBreaker - tiebreaker);
            }
        });

        await pick.save();

        return true;
    } catch (err) {
        LOGTAIL.error(`Error declaring ${pickId} winners ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}
