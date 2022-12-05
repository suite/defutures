import mongoose, { ObjectId } from "mongoose";

const { MONGO_URL } = process.env;
import Agenda, { Job } from "agenda";
import { Connection, Keypair, PublicKey, clusterApiUrl, Cluster } from "@solana/web3.js";
import createWagerEscrows from "../queries/createWagerEscrows";
import { PickSchema, WagerSchema } from "../misc/types";
import findMissingEscrowTransactions from "../queries/findMissingEscrowTransactions";
import Wager from '../model/wager';
import Pick from '../model/pick'
import { Logtail } from "@logtail/node";
import { getTeamWinner, getUpdateSelection, setSelectionTeamWinner, updateStats } from "../misc/utils";
import passport from "passport";
const TwitterStrategy = require("@superfaceai/passport-twitter-oauth2").Strategy;

export const PASSPORT_SECRET = process.env.PASSPORT_SECRET!;

// TODO: Better is dev check, move logtail to env, new for dev
export const IS_DEV = process.env.HEROKU ? false : true;
export const LOGTAIL = new Logtail("Mv7iTABrBnrLdVoKkZiabnyG");

export const AGENDA = new Agenda({ db: { address: MONGO_URL! } });

const CLUSTER = process.env.CLUSTER as Cluster || 'devnet';
const CLUSTER_URL = process.env.CLUSTER_URL as string;

export const CONNECTION = new Connection(
  CLUSTER_URL ? CLUSTER_URL : clusterApiUrl(CLUSTER),
  'confirmed'
);

const FUND_WALLET = process.env.FUND_WALLET as string;
const FUND_SEED = new Uint8Array(FUND_WALLET.split(",").map((e: string) => parseInt(e))).slice(0,32);
export const FUND_KEYPAIR = Keypair.fromSeed(FUND_SEED);

export const PAYOUT_PRECISION = 100;
export const FEE_MULTIPLIER = 0.931; // 6.9% off each bet
export const PICKEM_FEE_MULTIPLIER = 0.9;

export const ALGORITHM = "aes-192-cbc";
export const SALT = process.env.SALT as string;
export const KEY = process.env.KEY as string;

export const RAPID_API = process.env.RAPID_API as string;

// Change token type based  off cluster/clusterurl
// Dust mint: DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ
export const TOKEN_MINT = new PublicKey(process.env.TOKEN_MINT as string)

export const connectMongo = async () => {
  // Connecting to the database
  try {
    await mongoose.connect(MONGO_URL!)
    
    // Start
    await AGENDA.start();

    // Checks for live games and searches for missing txs
    await AGENDA.every("15 minutes", "check transactions");

    // Update pickem winners
    await AGENDA.every("10 minutes", "check winners");

     // Update stats
     await AGENDA.every("5 minutes", "update stats");
  } catch (err) {
    console.log("database connection failed. exiting now...");
    console.error(err);
    process.exit(1);
  }
};

// Init twitter oauth
// TODO: Check for env vars

// consumerKey: process.env.TWIT_API_KEY as string,
// consumerSecret: process.env.TWIT_API_SECRET as string,
// callbackURL: process.env.TWITTER_CALLBACK_URL as string


// passport.use(new TwitterStrategy({
//     clientType: "public",
//     clientID: process.env.TWIT_CLIENT_ID!,
//     clientSecret: process.env.TWIT_CLIENT_SECRET!
//   }, function (accessToken: any, refreshToken: any, profile: any, done: any) {
//     // TODO: Associate with user's public key
//     return done(null, profile);
//   }
// ));

passport.use(new TwitterStrategy({
    clientType: "confidential",
    clientID: process.env.TWIT_CLIENT_ID!,
    clientSecret: process.env.TWIT_CLIENT_SECRET!,
    callbackURL: process.env.TWITTER_CALLBACK_URL!,
    }, (accessToken: any, refreshToken: any, profile: any, done: any) => {
      console.log('Success!', { accessToken, refreshToken, profile });
      return done(null, profile);
    }
  )
);

      

// TODO: Implement
passport.serializeUser(function(user, cb) {
  cb(null, user);
});

// TODO: Implement
passport.deserializeUser(function(obj: any, cb) {
  cb(null, obj);
});

// pretty sure agenda handles errors
AGENDA.define("update status", async (job: Job) => {
  const { status, wagerId, wager } = job.attrs.data as {
    status: string,
    wagerId: ObjectId,
    wager: WagerSchema
  };

  LOGTAIL.info(`Updating pick status ${wagerId} to ${status}`)

  // Final check for missing txs before closing 
  if(status === 'closed') {
      const updatedWager: WagerSchema | null = await Wager.findById(wager._id);

      if(updatedWager) {
        for(const selection of updatedWager.selections) {
          if(selection.publicKey) {
              await findMissingEscrowTransactions(new PublicKey(selection.publicKey))
          }
        }
      }
  }

  await Wager.updateOne({ _id: wagerId }, { status })
})

AGENDA.define("update pick", async (job: Job) => {
  const { status, pickId } = job.attrs.data as {
    status: string,
    pickId: ObjectId,
  };

  LOGTAIL.info(`Updating pick status ${pickId} to ${status}`)

  // TODO: Build out for picks
  // Final check for missing txs before closing 
  // if(status === 'closed') {
  //     const updatedWager: WagerSchema | null = await Wager.findById(wager._id);

  //     if(updatedWager) {
  //       for(const selection of updatedWager.selections) {
  //         if(selection.publicKey) {
  //             await findMissingEscrowTransactions(new PublicKey(selection.publicKey))
  //         }
  //       }
  //     }
  // }

  await Pick.findByIdAndUpdate(pickId, { status })
})


AGENDA.define("check transactions", async (job: Job) => {
  const liveWagers: Array<WagerSchema> | null = await Wager.find({ status: 'live' });

  console.log("running check transactions")
  console.log("live wagers", liveWagers.length)

  LOGTAIL.info(`Running check transactions on ${liveWagers.length} live wagers.`)

  for(const wager of liveWagers) {
      for(const selection of wager.selections) {
          if(selection.publicKey) {
              await findMissingEscrowTransactions(new PublicKey(selection.publicKey))
          }
      }
  }
});

AGENDA.define("check winners", async (job: Job) => {
    const livePicks: Array<PickSchema> | null = await Pick.find({ status: 'closed' });
    
    LOGTAIL.info(`Running check winners on ${livePicks.length} closed pickems.`);

    for(const pick of livePicks) {
        // get selection 
        const updateSelection = await getUpdateSelection(pick._id);

        if(updateSelection !== null) {
          const winningTeams = await getTeamWinner(updateSelection);
          if(winningTeams === null) continue;
          
          await setSelectionTeamWinner(pick._id, updateSelection, winningTeams);
        }
    }

})

AGENDA.define("update stats", async (job: Job) => {
    LOGTAIL.info("Updating stats");

    await updateStats();
})