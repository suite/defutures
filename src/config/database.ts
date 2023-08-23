import mongoose from "mongoose";
import { ObjectId } from "mongodb";
import { TwitterApi } from 'twitter-api-v2';

const { MONGO_URL } = process.env;
import Agenda, { Job } from "agenda";
import { Connection, Keypair, PublicKey, clusterApiUrl, Cluster } from "@solana/web3.js";
import { PickSchema, SplToken, TokenDetails, WagerSchema } from "../misc/types";
import findMissingEscrowTransactions from "../queries/findMissingEscrowTransactions";
import Wager from '../model/wager';
import Pick from '../model/pick'
import { Logtail } from "@logtail/node";
import { getTeamWinner, getUpdateSelection, setSelectionTeamWinner, updateStats } from "../misc/utils";
import passport from "passport";
import { cancelWager } from "../queries/cancelWager";
const TwitterStrategy = require("@superfaceai/passport-twitter-oauth2").Strategy;

export const PASSPORT_SECRET = process.env.PASSPORT_SECRET!;

export const WALLET_SIGN_MESSAGE_LOGIN = process.env.WALLET_SIGN_MESSAGE_LOGIN!;
export const WALLET_SIGN_MESSAGE_LOGOUT = process.env.WALLET_SIGN_MESSAGE_LOGOUT!;

export const OAUTH_REDIRECT_URL = process.env.OAUTH_REDIRECT_URL!;

// TODO: Better is dev check, move logtail to env, new for dev
export const IS_DEV = process.env.HEROKU ? false : true;
export const LOGTAIL = new Logtail("Mv7iTABrBnrLdVoKkZiabnyG");

export const AGENDA = new Agenda({ db: { address: MONGO_URL! }, maxConcurrency: 100 });

const CLUSTER = process.env.CLUSTER as Cluster || 'devnet';
const CLUSTER_URL = process.env.CLUSTER_URL as string;

export const USE_DEV = (process.env.USE_DEV as string).toLocaleLowerCase() === 'true' ? true : false;

export const TOKEN_MAP: Record<SplToken, TokenDetails> = USE_DEV ? {
  DUST: {
      publicKey: new PublicKey("DUSTcnwRpZjhds1tLY2NpcvVTmKL6JJERD9T274LcqCr"),
      decimals: 9
  },
  USDC: {
      publicKey: new PublicKey("AkDWDJ37DqhLN95TL467NFAPixDTq1L6iXLJ1Boqznr1"),
      decimals: 6
  }
} : {
  DUST: {
      publicKey: new PublicKey("DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ"),
      decimals: 9
  },
  USDC: {
      publicKey: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
      decimals: 6
  }
};

console.log(`Using devnet: ${USE_DEV}`)

export const CONNECTION = new Connection(
  USE_DEV ? clusterApiUrl('devnet') :
  (CLUSTER_URL ? CLUSTER_URL : clusterApiUrl(CLUSTER),
  'confirmed')
);

const FUND_WALLET = process.env.FUND_WALLET as string;
const FUND_SEED = new Uint8Array(FUND_WALLET.split(",").map((e: string) => parseInt(e))).slice(0,32);
export const FUND_KEYPAIR = Keypair.fromSeed(FUND_SEED);

export const PAYOUT_PRECISION = 100;
export const FEE_MULTIPLIER = 0.931; // 6.9% off each bet
export const PICKEM_FEE_MULTIPLIER = 0.9;
const VOLUME_DIFFERENCE_THRESHOLD = 0.07;

export const ALGORITHM = "aes-192-cbc";
export const SALT = process.env.SALT as string;
export const KEY = process.env.KEY as string;

export const RAPID_API = process.env.RAPID_API as string;

export const LIVE_GAME_CAP = 10;

// Change token type based  off cluster/clusterurl
// Dust mint: DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ
// export const TOKEN_MINT = new PublicKey(process.env.TOKEN_MINT as string)

export const connectMongo = async () => {
  // Connecting to the database
  try {
    initTwitter();

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

// Init twitter api
export const TWITTER = new TwitterApi({
  appKey: process.env.TWITTER_BOT_APP_KEY!,
  appSecret: process.env.TWITTER_BOT_APP_SECRET!,
  accessToken: process.env.TWITTER_BOT_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_BOT_ACCESS_SECRET!,
});


// Init twitter oauth
const initTwitter = () => {
  passport.use(new TwitterStrategy({
      clientType: "confidential",
      clientID: process.env.TWIT_CLIENT_ID!,
      clientSecret: process.env.TWIT_CLIENT_SECRET!,
      callbackURL: process.env.TWITTER_CALLBACK_URL!,
      }, (accessToken: any, refreshToken: any, profile: any, done: any) => {
        return done(null, profile);
      }
    )
  );

      
  passport.serializeUser(function(user, cb) {
    cb(null, user);
  });

  passport.deserializeUser(function(obj: any, cb) {
    cb(null, obj);
  });
}

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
      const updatedWager: WagerSchema | null = await Wager.findById(wagerId);
      
      // TODO: Handle this?
      if(!updatedWager) {
        return;
      }

      const selectionBets = updatedWager.selections.map(selection => 
        updatedWager.placedBets.filter(bet => JSON.stringify(bet.selectionId) === JSON.stringify(selection._id))
      );

      // Must have 1 pick for each selection
      if (selectionBets.some(bets => bets.length === 0)) {
        await cancelWager(wagerId);
        return;
      }
      
      const selectionBetTotals = selectionBets.map(bets =>
        bets.flatMap(bet => bet.amounts.map(amount => amount.amount))
             .reduce((a, b) => a + b, 0)
      );
      
      const [total1, total2] = selectionBetTotals;

      if(!(total1 >= total2 * VOLUME_DIFFERENCE_THRESHOLD 
        && total2 >= total1 * VOLUME_DIFFERENCE_THRESHOLD)) {
          await cancelWager(wagerId);
          return;
      }

      if(updatedWager) {
        for(const selection of updatedWager.selections) {
          if(selection.publicKey) {
              await findMissingEscrowTransactions(new PublicKey(selection.publicKey), updatedWager.token);
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
              await findMissingEscrowTransactions(new PublicKey(selection.publicKey), wager.token);
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

