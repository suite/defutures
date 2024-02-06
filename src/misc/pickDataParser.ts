// pub key, team1 pick, team2 pick, tiebreaker, #num won
require("dotenv").config();
import mongoose, { ObjectId } from "mongoose";
import Pick from '../model/pick'
import { PickSchema, PickTeam } from "./types";
import {stringify} from 'csv-stringify';
import fs from 'fs';

const { MONGO_URL } = process.env;

const connectMongo = async () => {
    // Connecting to the database
    try {
      await mongoose.connect(MONGO_URL!)
      
        console.log("Connected to database")

        await parsePick()
    } catch (err) {
      console.log("database connection failed. exiting now...");
      console.error(err);
      process.exit(1);
    }
};

const parsePick = async () => {

    const pick: PickSchema | null = await Pick.findById("6338b17f19ba8cde131bfec8");

    if(pick === null) {
        return console.log("Error loading pick")
    }

    const data = [];

    const columns: { [key: string]: string } = {
        pubKey: 'pubKey'
    }

    const teamData: { [key: string]: PickTeam } = {};

    let teamNum = 1;
    for(const selection of pick.selections) {
        columns[`Team ${teamNum}`] = `Team ${teamNum}`;

        teamNum++;

        for(const team of selection.teams) {
            teamData[JSON.stringify(team._id)] = team;
        }
    };

    columns['tiebreaker'] = 'tiebreaker';
    columns['#num won'] = '#num won'

    for(const placedBet of pick.placedBets) {
        const userData = [];
        userData.push(placedBet.publicKey);
        
        for(const teamSelection of placedBet.pickedTeams) {
            userData.push(teamData[JSON.stringify(teamSelection)].name);
        }

        userData.push(placedBet.tieBreaker);
        userData.push(placedBet.points);

        data.push(userData);
    }

    stringify(data, { header: true, columns: columns }, (err, output) => {
        if (err) throw err;
        fs.writeFile('my4.csv', output, (err) => {
          if (err) throw err;
          console.log('my4.csv saved.');
        });
      });

}

(async () => {
    await connectMongo()
})()